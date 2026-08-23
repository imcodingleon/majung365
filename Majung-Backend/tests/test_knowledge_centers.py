"""KB·센터 데이터 로드·필터."""

import json
from pathlib import Path

import pytest

from app.domains.centers.infrastructure.district_office_repository import (
    JsonDistrictOfficeRepository,
)
from app.domains.centers.infrastructure.json_repository import JsonCenterRepository
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository
from app.domains.shared.routes import ROUTE_SECTION, RouteId, SectionId


def test_kb_covers_every_route() -> None:
    """지원 항목 14개가 전부 최소 1개 제도를 가져야 한다.
    빈 항목이 생기면 그 항목으로 라우팅된 답변에 카드가 붙지 않는다."""
    repo = JsonInstitutionRepository()
    covered = {r for i in repo.all() for r in i.route_ids}
    assert covered == set(RouteId), f"제도가 없는 항목: {sorted(set(RouteId) - covered)}"


def test_kb_by_route_nonempty() -> None:
    repo = JsonInstitutionRepository()
    for route in RouteId:
        assert repo.by_route(route), f"{route.value} 항목에 제도가 없다"


# 항목 이름이 가리키는 제도가 그 항목의 대표여야 한다. 대표가 어긋나면 사용자가
# 엉뚱한 곳으로 간다 — R10에 "통장 정지 풀기"가 대표면 통장이 아예 없는 사람이 헛걸음한다.
_ROUTE_LEAD: dict[RouteId, str] = {
    RouteId.R1: "housing-koreha-residence",
    RouteId.R2: "welfare-koreha-emergency",
    RouteId.R3: "health-koreha-basic",
    RouteId.R4: "housing-koreha-rental",
    RouteId.R6: "employment-koreha-job",
    RouteId.R7: "startup-koreha-support",
    RouteId.R8: "health-mental-support",
    # 재발급과 재등록은 다른 절차다. "신분증 잃어버렸는데"에 재등록이 나가면
    # 주민센터에서 헛걸음한다.
    RouteId.R9: "identity-id-card-reissue",
    RouteId.R10: "identity-bank-account",
    RouteId.R11: "identity-address-registration",
    RouteId.R12: "welfare-basic-livelihood",
    RouteId.R13: "identity-proof-of-release",
    RouteId.R14: "debt-credit-recovery",
    RouteId.R15: "health-medical-aid",
}


def test_every_route_has_expected_lead() -> None:
    repo = JsonInstitutionRepository()
    assert set(_ROUTE_LEAD) == set(RouteId), "표에 빠진 지원 항목이 있다"
    for route, expected_id in _ROUTE_LEAD.items():
        assert repo.lead_of(route).id == expected_id, f"{route.value}의 대표가 바뀌었다"


def test_lead_is_listed_first_in_by_route() -> None:
    """대표는 그 항목의 제도 목록에서도 맨 앞에 온다."""
    repo = JsonInstitutionRepository()
    for route in RouteId:
        assert repo.by_route(route)[0].id == repo.lead_of(route).id


def test_lead_for_is_subset_of_route_ids() -> None:
    """근거이기만 한 항목의 대표로 잘못 표시되면 안 된다."""
    repo = JsonInstitutionRepository()
    for inst in repo.all():
        assert set(inst.lead_for) <= set(inst.route_ids), inst.id


def test_loader_rejects_duplicate_lead(tmp_path: Path) -> None:
    """한 항목에 대표가 둘이면 부팅이 멈춰야 한다 — 잘못된 KB로 서비스하지 않는다."""
    repo = JsonInstitutionRepository()
    rows = [
        {
            "id": i.id,
            "route_ids": [r.value for r in i.route_ids],
            "lead_for": [r.value for r in i.route_ids] if i.id == "debt-legal-aid" else [
                r.value for r in i.lead_for
            ],
            "name": i.name,
            "summary_easy": i.summary_easy,
            "where": i.where,
            "docs": list(i.docs),
            "next_step": i.next_step,
            "deadline": i.deadline,
            "source_url": i.source_url,
        }
        for i in repo.all()
    ]
    broken = tmp_path / "institutions.json"
    broken.write_text(json.dumps({"institutions": rows}, ensure_ascii=False), encoding="utf-8")

    with pytest.raises(ValueError, match="대표 제도가 둘이다"):
        JsonInstitutionRepository(broken)


def test_loader_rejects_missing_lead(tmp_path: Path) -> None:
    """대표가 하나도 없는 항목이 있으면 부팅이 멈춰야 한다."""
    repo = JsonInstitutionRepository()
    rows = [
        {
            "id": i.id,
            "route_ids": [r.value for r in i.route_ids],
            "lead_for": [r.value for r in i.lead_for if r != RouteId.R7],
            "name": i.name,
            "summary_easy": i.summary_easy,
            "where": i.where,
            "docs": list(i.docs),
            "next_step": i.next_step,
            "deadline": i.deadline,
            "source_url": i.source_url,
        }
        for i in repo.all()
    ]
    broken = tmp_path / "institutions.json"
    broken.write_text(json.dumps({"institutions": rows}, ensure_ascii=False), encoding="utf-8")

    with pytest.raises(ValueError, match="대표 제도가 없는"):
        JsonInstitutionRepository(broken)


def test_every_route_belongs_to_a_section() -> None:
    """분야 매핑이 빠진 항목이 있으면 초기 진단 6분야 어디에도 못 실린다."""
    assert set(ROUTE_SECTION) == set(RouteId)
    assert set(ROUTE_SECTION.values()) == set(SectionId)


def test_r5_stays_retired() -> None:
    """R5(가족지원)는 결번이다. 번호를 다시 매기면 기획서의 모든 참조가 어긋난다."""
    assert "R5" not in {r.value for r in RouteId}
    assert len(RouteId) == 14


def test_centers_filter_and_fallback() -> None:
    repo = JsonCenterRepository()
    assert repo.all(), "센터 데이터가 비어있다"
    gov = repo.by_category("법무보호공단")
    assert gov and all(c.category == "법무보호공단" for c in gov)
    # 없는 카테고리
    assert repo.by_category("존재하지않음") == []


def test_district_offices_filter_by_sigungu() -> None:
    repo = JsonDistrictOfficeRepository()
    assert repo.count() > 3000, "전국 데이터가 들어와야 한다"

    songpa = repo.by_sigungu("송파구")
    assert songpa and all(o.sigungu == "송파구" for o in songpa)
    assert all(o.address and o.dong for o in songpa), "주소와 동 이름은 비면 안 된다"


def test_district_offices_sido_disambiguates() -> None:
    """시군구 이름은 시도가 달라도 겹친다. 시도를 주면 그것만 남아야 한다."""
    repo = JsonDistrictOfficeRepository()
    all_junggu = repo.by_sigungu("중구")
    seoul_junggu = repo.by_sigungu("중구", sido="서울")

    assert len({o.sido for o in all_junggu}) > 1, "여러 시도에 중구가 있어야 이 테스트가 의미 있다"
    assert seoul_junggu and all(o.sido == "서울" for o in seoul_junggu)
    assert len(seoul_junggu) < len(all_junggu)


def test_district_offices_unknown_sigungu_is_empty() -> None:
    """없는 시군구는 빈 목록이다. 전체로 폴백하면 3,555건이 그대로 나간다."""
    repo = JsonDistrictOfficeRepository()
    assert repo.by_sigungu("존재하지않는구") == []


def test_district_office_zipcodes_are_five_digits() -> None:
    """원본 CSV는 서울 427건의 우편번호를 4자리로 준다(엑셀이 앞의 0을 날린다).
    그대로 두면 사용자가 우편번호를 잘못 쓰므로 변환 도구가 5자리로 채운다."""
    repo = JsonDistrictOfficeRepository()
    bad = [
        o for o in repo.by_sigungu("송파구")
        if not (o.zipcode.isdigit() and len(o.zipcode) == 5)
    ]
    assert not bad, f"우편번호 형식이 틀린 건: {[(o.name, o.zipcode) for o in bad]}"

    seoul_junggu = repo.by_sigungu("중구", sido="서울")
    assert seoul_junggu and all(o.zipcode.startswith("0") for o in seoul_junggu), (
        "서울 우편번호는 0으로 시작한다 — 앞자리가 잘렸다는 신호다"
    )


# ── 결과 카드 확장 필드 (기획서 §4.1 · §12-14) ──


def test_extension_fields_default_to_empty() -> None:
    """스키마만 먼저 두고 값은 확정된 것부터 채운다. 지금은 전부 비어 있는 것이 정상이다."""
    repo = JsonInstitutionRepository()
    for inst in repo.all():
        assert isinstance(inst.benefit_summary, str)
        assert isinstance(inst.eligibility, tuple)
        assert isinstance(inst.steps, tuple)
        assert isinstance(inst.cautions, tuple)


def test_extension_fields_load_when_present(tmp_path: Path) -> None:
    """값이 들어오면 그대로 실린다 — 문구가 확정되면 데이터만 채우면 된다."""
    repo = JsonInstitutionRepository()
    rows = []
    for i in repo.all():
        row = {
            "id": i.id,
            "route_ids": [r.value for r in i.route_ids],
            "lead_for": [r.value for r in i.lead_for],
            "name": i.name,
            "summary_easy": i.summary_easy,
            "where": i.where,
            "docs": list(i.docs),
            "next_step": i.next_step,
            "deadline": i.deadline,
            "source_url": i.source_url,
        }
        if i.id == "startup-koreha-support":
            row["benefit_summary"] = "연이율 2.5%로 최대 5천만원, 최대 6년"
            row["cautions"] = ["임차보증금의 50% 이상은 본인이 준비해야 해요"]
            row["eligibility"] = ["빚 문제로 법원에 이름이 올라가 있으면 어려울 수 있어요"]
        rows.append(row)

    path = tmp_path / "institutions.json"
    path.write_text(json.dumps({"institutions": rows}, ensure_ascii=False), encoding="utf-8")

    loaded = JsonInstitutionRepository(path).by_id("startup-koreha-support")
    assert loaded is not None
    assert "5천만원" in loaded.benefit_summary
    assert loaded.cautions and loaded.eligibility


def test_tab_labels_fit_the_tab_width() -> None:
    """인덱스 탭은 5자까지 들어가고 6자부터 잘린다. 잘리면 무슨 일인지 알 수 없다."""
    from app.domains.shared.routes import ROUTE_TAB_LABELS

    assert set(ROUTE_TAB_LABELS) == set(RouteId), "탭 이름이 없는 항목이 있다"
    too_long = {r.value: t for r, t in ROUTE_TAB_LABELS.items() if len(t) > 5}
    assert not too_long, f"5자를 넘는 탭 이름: {too_long}"
