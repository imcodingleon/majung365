"""초기 진단 판정 — 27문항 답변에서 할 일 목록을 가린다 (기획서 §3.8 · §4.1 · §5.2)."""

import pytest
from fastapi.testclient import TestClient

from app.domains.knowledge.application.intake_usecase import IntakeUseCase
from app.domains.knowledge.domain.graph_engine import routes_blocking_others
from app.domains.knowledge.domain.intake import IntakeRule, judge
from app.domains.knowledge.infrastructure.graph_repository import JsonGraphRepository
from app.domains.knowledge.infrastructure.intake_rules_repository import (
    JsonIntakeRuleRepository,
)
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository
from app.domains.shared.routes import RouteId


def _usecase() -> IntakeUseCase:
    return IntakeUseCase(
        institutions=JsonInstitutionRepository(),
        rules=JsonIntakeRuleRepository().all(),
        blocking_routes=routes_blocking_others(JsonGraphRepository().nodes()),
    )


def test_rules_cover_every_route() -> None:
    """규칙이 빠진 항목은 어떤 답을 해도 할 일이 되지 않는다. 로더가 부팅 시 막는다."""
    rules = JsonIntakeRuleRepository().all()
    assert {r.route_id for r in rules} == set(RouteId)


def test_unanswered_questions_make_no_task() -> None:
    """화면에 보이지 않은 문항의 답은 오지 않는다. 답하지 않은 것을 할 일로 만들지 않는다."""
    tasks = _usecase().run({"identityStatus": "NOT_USABLE"})
    assert [t.route_id for t in tasks] == ["R9"]


def test_missing_key_is_not_an_error() -> None:
    """특정 키가 항상 온다고 가정하면 안 된다 — 답을 바꿔 꼬리질문이 닫히면 빠진다."""
    assert _usecase().run({}) == ()


def test_blocking_routes_come_first() -> None:
    """다음에 열릴 탭이 정해져야 "6개 중 2개 완료"를 셀 수 있다."""
    tasks = _usecase().run(
        {
            "counselingNeed": "NEEDED",  # R8 — 선행조건 아님
            "identityStatus": "NOT_USABLE",  # R9 — 여러 항목의 선행조건
        }
    )
    assert tasks[0].route_id == "R9" and tasks[0].blocks_others
    assert not tasks[1].blocks_others


def test_completed_routes_drop_out() -> None:
    """완료 처리는 프론트가 완료 목록을 늘려 다시 부르는 것으로 돈다 — 서버는 상태를 안 든다."""
    answers = {"identityStatus": "NOT_USABLE", "counselingNeed": "NEEDED"}
    before = _usecase().run(answers)
    after = _usecase().run(answers, completed=frozenset({RouteId.R9}))
    assert len(after) == len(before) - 1
    assert "R9" not in [t.route_id for t in after]


def test_resolved_option_drops_the_task() -> None:
    """이미 해결된 답을 골랐으면 할 일에서 뺀다. optionId가 확정되면 데이터만 채운다."""
    rules = (IntakeRule(RouteId.R9, "identityStatus", frozenset({"USABLE"})),)
    assert judge({"identityStatus": "USABLE"}, rules) == ()
    assert len(judge({"identityStatus": "NOT_USABLE"}, rules)) == 1


def test_multi_select_needs_all_resolved() -> None:
    """복수선택은 하나라도 미해결이 남으면 아직 할 일이다."""
    rules = (IntakeRule(RouteId.R7, "startupReadinessIds", frozenset({"UNKNOWN"})),)
    assert judge({"startupReadinessIds": ["UNKNOWN"]}, rules) == ()
    assert len(judge({"startupReadinessIds": ["UNKNOWN", "STARTUP_TRAINING"]}, rules)) == 1


def test_empty_resolved_options_keeps_task() -> None:
    """optionId 확정 전에는 답이 온 이상 항상 할 일로 잡는다 — 놓치는 쪽이 더 나쁘다."""
    rules = (IntakeRule(RouteId.R9, "identityStatus"),)
    assert len(judge({"identityStatus": "무슨값이든"}, rules)) == 1


def test_card_has_one_option_per_path() -> None:
    """할 일 하나에 카드 하나. 신청할 곳이 둘이면 옵션으로 묶인다."""
    tasks = _usecase().run({"emergencyExpenseType": "LIVING", "counselingNeed": "NEEDED"})
    r2 = next(t for t in tasks if t.route_id == "R2")
    r8 = next(t for t in tasks if t.route_id == "R8")
    assert len(r2.card.options) == 2
    assert len(r8.card.options) == 1


@pytest.fixture
def client() -> TestClient:
    from app.main import app

    return TestClient(app)


def test_endpoint_returns_tasks(client: TestClient) -> None:
    with client:
        r = client.post(
            "/api/intake/analyze",
            json={"answers": {"identityStatus": "NOT_USABLE", "counselingNeed": "NEEDED"}},
        )
    assert r.status_code == 200
    tasks = r.json()["tasks"]
    assert [t["route_id"] for t in tasks] == ["R9", "R8"]
    assert tasks[0]["section_label"] == "신분·행정"


def test_endpoint_rejects_oversized_answers(client: TestClient) -> None:
    """화면에 없는 키가 대량으로 오는 것을 막는다."""
    with client:
        r = client.post(
            "/api/intake/analyze",
            json={"answers": {f"key{i}": "v" for i in range(50)}},
        )
    assert r.status_code == 400
