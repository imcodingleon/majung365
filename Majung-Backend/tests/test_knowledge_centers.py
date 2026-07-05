"""KB·센터 데이터 로드·필터."""

from app.domains.centers.infrastructure.json_repository import JsonCenterRepository
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository
from app.domains.shared.areas import Area


def test_kb_loads_all_six_areas() -> None:
    repo = JsonInstitutionRepository()
    covered = {i.area for i in repo.all()}
    assert covered == set(Area), "6영역 전부 최소 1개 제도가 있어야 한다"


def test_kb_by_area_nonempty() -> None:
    repo = JsonInstitutionRepository()
    for area in Area:
        assert repo.by_area(area), f"{area.value} 영역에 제도가 없다"


def test_centers_filter_and_fallback() -> None:
    repo = JsonCenterRepository()
    assert repo.all(), "센터 데이터가 비어있다"
    gov = repo.by_category("법무보호공단")
    assert gov and all(c.category == "법무보호공단" for c in gov)
    # 없는 카테고리
    assert repo.by_category("존재하지않음") == []
