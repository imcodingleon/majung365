"""KB·센터 데이터 로드·필터."""

import json
from pathlib import Path

import pytest

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
    RouteId.R4: "housing-emergency-welfare-housing",
    RouteId.R6: "employment-koreha-job",
    RouteId.R7: "startup-koreha-support",
    RouteId.R8: "health-mental-support",
    RouteId.R9: "identity-resident-registration",
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
