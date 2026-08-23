"""지역 이름 정규화 — 기획서 §5.4.

**기기가 보내는 이름과 우리 데이터의 이름이 다르다.** 맞추지 않으면 조회가
조용히 빈다 — 오류가 아니라 목록이 줄어드는 형태라, 화면에서는 "그 지역에
없나 보다"로 읽힌다.
"""

from app.domains.centers.domain.region import (
    address_hints_district,
    district_matches,
    normalize_district,
    normalize_sido,
)
from app.domains.centers.infrastructure.district_office_repository import (
    JsonDistrictOfficeRepository,
)
from app.domains.centers.infrastructure.support_institution_repository import (
    JsonSupportInstitutionRepository,
)
from app.domains.shared.routes import RouteId, institution_kinds_for


def test_official_names_become_short_ones() -> None:
    """기기의 역지오코딩은 정식 명칭을 준다. 데이터는 짧은 형태다."""
    assert normalize_sido("서울특별시") == "서울"
    assert normalize_sido("부산광역시") == "부산"
    assert normalize_sido("경기도") == "경기"
    assert normalize_sido("강원특별자치도") == "강원"
    assert normalize_sido("제주특별자치도") == "제주"
    assert normalize_sido("세종특별자치시") == "세종"


def test_two_letter_names_need_a_table() -> None:
    """규칙으로 자르면 "충청남"이 된다. 데이터는 "충남"이다."""
    assert normalize_sido("충청남도") == "충남"
    assert normalize_sido("전라북도") == "전북"
    assert normalize_sido("경상북도") == "경북"


def test_short_names_pass_through() -> None:
    """화면이 무엇을 보내든 받는다."""
    assert normalize_sido("서울") == "서울"
    assert normalize_sido("") == ""
    assert normalize_sido(None) == ""


def test_district_is_not_trimmed() -> None:
    """**자르지 않는다.** "수원시 장안구"를 "수원시"로 줄이면 반대 방향을 놓친다."""
    assert normalize_district(" 수원시 장안구 ") == "수원시 장안구"


def test_either_side_containing_the_other_is_the_same_place() -> None:
    """기기가 어느 단위까지 줄지 정해져 있지 않다."""
    assert district_matches("수원시", "수원시 장안구")
    assert district_matches("수원시 장안구", "수원시")
    assert not district_matches("수원시", "성남시")
    assert not district_matches("", "수원시")


def test_address_narrows_within_one_city() -> None:
    """시군구가 같아도 한 시에 여러 곳이 있다. 장안구 사람에게 영통구는 멀다."""
    assert address_hints_district("수원시 장안구 송원로 101", "수원시 장안구")
    assert not address_hints_district("수원시 영통구 영통로 396", "수원시 장안구")
    # 구가 안 왔으면 판단하지 않는다 — "수원시"는 어느 주소에나 있다.
    assert not address_hints_district("수원시 장안구 송원로 101", "수원시")


# ── 실제 데이터로 ──


def test_official_name_finds_local_centers() -> None:
    """**정신건강복지센터 246곳이 통째로 걸러진 적이 있다.**

    "서울특별시"로 물으면 데이터의 "서울"과 안 맞아, 어느 지역에서 물어도
    허그상담소 세 곳만 나왔다.
    """
    repo = JsonSupportInstitutionRepository()
    kinds = institution_kinds_for(RouteId.R8)
    found = repo.find(kinds, "서울특별시", "송파구", limit=3)
    assert found, "정식 명칭으로 물었는데 아무것도 안 나온다"
    assert found[0].district == "송파구", [f.name for f in found]


def test_different_regions_give_different_results() -> None:
    """지역을 넣어도 결과가 안 바뀌던 것이 이 문제의 증상이었다."""
    repo = JsonSupportInstitutionRepository()
    kinds = institution_kinds_for(RouteId.R8)
    seoul = repo.find(kinds, "서울특별시", "송파구", limit=1)
    busan = repo.find(kinds, "부산광역시", "해운대구", limit=1)
    assert seoul[0].name != busan[0].name, "지역이 달라도 같은 곳이 나온다"


def test_district_offices_take_official_names_too() -> None:
    repo = JsonDistrictOfficeRepository()
    assert repo.by_sigungu("송파구", "서울특별시"), "정식 명칭으로 못 찾는다"
    assert repo.by_sigungu("해운대구", "부산광역시")
