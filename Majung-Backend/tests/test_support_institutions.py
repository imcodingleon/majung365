"""지원 항목별 기관 조회 — 항목마다 갈 기관의 종류가 다르다."""

import pytest
from fastapi.testclient import TestClient

from app.domains.centers.infrastructure.support_institution_repository import (
    JsonSupportInstitutionRepository,
)
from app.domains.shared.routes import RouteId, institution_kinds_for


def _repo() -> JsonSupportInstitutionRepository:
    return JsonSupportInstitutionRepository()


def test_training_centers_do_not_appear_in_general_support() -> None:
    """"가까운 공단"에 교육원이 나오면 헛걸음이다."""
    found = _repo().find(institution_kinds_for(RouteId.R1))
    assert found
    assert all(i.kind in ("branch", "head") for i in found)


def test_employment_route_includes_training_centers() -> None:
    """R6은 직업훈련이라 교육원이 나와야 한다."""
    kinds = {i.kind for i in _repo().find(institution_kinds_for(RouteId.R6), limit=40)}
    assert "training" in kinds


def test_counseling_route_mixes_hug_and_mental_health() -> None:
    """R8은 공단 허그센터와 지역 정신건강복지센터 양쪽이다."""
    found = _repo().find(institution_kinds_for(RouteId.R8), limit=40)
    assert {i.kind for i in found} == {"hug", "mental_health"}


def test_koreha_is_not_buried_by_local_centers() -> None:
    """허그센터는 3곳뿐이라 가까움만으로 줄 세우면 246곳에 묻혀 화면에 안 나온다.

    지역이 맞는 센터가 먼저 오되, 공단 기관이 그다음이라 목록 앞쪽에서 보여야 한다.
    """
    found = _repo().find(institution_kinds_for(RouteId.R8), sido="서울", district="강남구")
    assert any(i.kind == "hug" for i in found), "허그센터가 목록에 없다"


def test_same_district_comes_first() -> None:
    """좌표를 받지 않으므로 행정구역이 겹치는 정도로 가까움을 가늠한다."""
    found = _repo().find(
        institution_kinds_for(RouteId.R8), sido="서울", district="강남구"
    )
    assert found[0].district == "강남구"


def test_sido_filter_falls_back_when_empty() -> None:
    """그 시도에 기관이 없으면 빈 목록 대신 전국을 준다 — 갈 곳이 없다고 하면 안 된다."""
    found = _repo().find(institution_kinds_for(RouteId.R8), sido="세종")
    assert found, "세종에 허그센터가 없어도 다른 지역이라도 안내해야 한다"


def test_routes_without_institutions_are_empty() -> None:
    """신분증·통장은 공단이 아니라 주민센터·은행으로 간다. 빈 집합이 정상이다."""
    for route in (RouteId.R9, RouteId.R10, RouteId.R11, RouteId.R13):
        assert institution_kinds_for(route) == frozenset()


def test_mental_health_centers_get_a_name() -> None:
    """원본에 이름 칸이 없다. "강남구 정신건강복지센터"로 만들어야 어디인지 안다."""
    centers = [i for i in _repo().all() if i.kind == "mental_health"]
    assert centers and all("정신건강복지센터" in i.name for i in centers)


@pytest.fixture
def client() -> TestClient:
    from app.main import app

    return TestClient(app)


def test_endpoint_returns_nearby_first(client: TestClient) -> None:
    with client:
        r = client.get(
            "/api/institutions",
            params={"route": "R8", "sido": "서울", "district": "강남구"},
        )
    assert r.status_code == 200
    body = r.json()
    assert body and body[0]["district"] == "강남구"


def test_endpoint_rejects_unknown_route(client: TestClient) -> None:
    with client:
        r = client.get("/api/institutions", params={"route": "R99"})
    assert r.status_code == 400


def test_endpoint_returns_empty_for_non_koreha_route(client: TestClient) -> None:
    with client:
        r = client.get("/api/institutions", params={"route": "R9"})
    assert r.status_code == 200 and r.json() == []


def test_same_sido_koreha_branch_comes_first() -> None:
    """서울 사용자에게 강원 지부가 먼저 나오면 안 된다. 공단도 시도를 본다."""
    found = _repo().find(institution_kinds_for(RouteId.R1), sido="서울", district="강남구")
    assert found[0].sido == "서울"
