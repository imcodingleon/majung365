"""사용자가 말한 동의 주민센터 — 기획서 §5.4.

**있는 데이터를 없다고 말하면 안 된다.** "송파구 오금동 사는데 근처 주민센터
알려줘"에 "가진 자료에 없어요, 인터넷에서 찾아보세요"라고 답한 적이 있다.
그 순간 서버에는 그 주민센터의 이름과 주소가 있었다.
"""

import pytest

from app.domains.centers.domain.entity import DistrictOffice
from app.domains.centers.infrastructure.district_office_repository import (
    JsonDistrictOfficeRepository,
)
from app.domains.chat.application.usecase import ChatUseCase
from app.domains.chat.domain.local_office import answer_for
from app.domains.chat.domain.triage import (
    QuestionType,
    RoutePriority,
    TriageResult,
    UserRegion,
)
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository
from app.domains.shared.routes import RouteId
from tests.fakes import FakeLlm

_OFFICES = JsonDistrictOfficeRepository()


def _office(sido: str, sigungu: str, dong: str) -> DistrictOffice:
    return DistrictOffice(
        sido=sido,
        sigungu=sigungu,
        dong=dong,
        kind="주민센터",
        name=f"{dong} 주민센터",
        zipcode="00000",
        address=f"{sido} {sigungu} 어딘가",
    )


# ── 판정 ──


def test_one_place_is_answered_directly() -> None:
    result = answer_for("오금동", [_office("서울", "송파구", "오금동")])
    assert result.found
    assert not result.needs_region
    assert "오금동 주민센터" in result.injection


def test_many_places_must_be_asked_back() -> None:
    """**서버가 하나를 고르면 사용자가 엉뚱한 동네로 찾아간다.**

    "중앙동"은 전국 31곳이다. 어느 곳인지는 사용자만 안다.
    """
    result = answer_for(
        "중앙동",
        [
            _office("강원", "강릉시", "중앙동"),
            _office("경기", "과천시", "중앙동"),
            _office("서울", "관악구", "중앙동"),
        ],
    )
    assert result.needs_region
    assert "여러 곳" in result.injection
    assert "강원 강릉시" in result.injection


def test_nothing_found_stays_empty() -> None:
    """없으면 지금처럼 모른다고 답하는 것이 맞다. 지어내지 않는다."""
    assert not answer_for("없는동", []).found


def test_too_many_choices_are_trimmed() -> None:
    """31곳을 다 늘어놓으면 고르기가 더 어렵다."""
    many = [_office("서울", f"{i}구", "중앙동") for i in range(20)]
    result = answer_for("중앙동", many)
    assert "외 " in result.injection and "곳" in result.injection


def test_phone_is_not_invented() -> None:
    """전화번호는 원본(행정안전부)에 없다. 지어내지 않고 110으로 넘긴다."""
    result = answer_for("오금동", [_office("서울", "송파구", "오금동")])
    assert "110" in result.injection


# ── 유스케이스 연결 ──


def _usecase() -> ChatUseCase:
    triage = TriageResult(QuestionType.SUPPORT, ())
    return ChatUseCase(
        FakeLlm(triage), JsonInstitutionRepository(), district_offices=_OFFICES
    )


def _lookup(region: UserRegion):  # type: ignore[no-untyped-def]
    usecase = _usecase()
    triage = TriageResult(
        QuestionType.SUPPORT,
        (RoutePriority(route=RouteId.R11),),
        region=region,
    )
    return usecase._local_office(triage)


def test_real_data_finds_the_office() -> None:
    result = _lookup(UserRegion(sigungu="송파구", dong="오금동"))
    assert result.found and not result.needs_region
    assert "오금로25길" in result.injection


def test_same_dong_name_in_two_cities_asks_back() -> None:
    """오금동도 송파구와 군포시 두 곳이다. 흔한 이름만의 문제가 아니다."""
    result = _lookup(UserRegion(dong="오금동"))
    assert result.needs_region


def test_no_region_means_no_lookup() -> None:
    """지역을 말하지 않았으면 찾지 않는다 — 짐작해서 채우지 않는다."""
    assert not _lookup(UserRegion()).found


def test_missing_repository_is_not_an_error() -> None:
    """저장소가 없어도 챗은 계속 답한다."""
    usecase = ChatUseCase(
        FakeLlm(TriageResult(QuestionType.SUPPORT, ())), JsonInstitutionRepository()
    )
    triage = TriageResult(
        QuestionType.SUPPORT, (), region=UserRegion(dong="오금동")
    )
    assert not usecase._local_office(triage).found


@pytest.mark.parametrize("dong", ["", "   "])
def test_blank_dong_is_ignored(dong: str) -> None:
    assert not _lookup(UserRegion(dong=dong)).found
