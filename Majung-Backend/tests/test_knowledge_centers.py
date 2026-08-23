"""KB·센터 데이터 로드·필터."""

from app.domains.centers.infrastructure.json_repository import JsonCenterRepository
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository
from app.domains.shared.routes import ROUTE_SECTION, RouteId, SectionId

# 아직 대응 제도를 확보하지 못한 항목. KB가 채워지면 이 집합을 줄인다 —
# 비워두면 커버리지 구멍이 조용히 늘어나도 테스트가 알려주지 않는다.
_KB_UNCOVERED: frozenset[RouteId] = frozenset({RouteId.R3, RouteId.R7})


def test_kb_covers_every_route_except_known_gaps() -> None:
    repo = JsonInstitutionRepository()
    covered = {r for i in repo.all() for r in i.route_ids}
    assert covered == set(RouteId) - _KB_UNCOVERED
    assert not (covered & _KB_UNCOVERED), "미커버로 표시된 항목에 제도가 생겼다 — 목록을 갱신하라"


def test_kb_by_route_nonempty() -> None:
    repo = JsonInstitutionRepository()
    for route in set(RouteId) - _KB_UNCOVERED:
        assert repo.by_route(route), f"{route.value} 항목에 제도가 없다"


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
