"""초기 진단 판정 — 27문항 답변에서 할 일 목록을 가린다 (기획서 §3.8 · §4.1 · §5.2)."""

import json
from pathlib import Path

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
    rules = (IntakeRule(RouteId.R4, "housingConditionIds", frozenset({"NONE"})),)
    assert judge({"housingConditionIds": ["NONE"]}, rules) == ()
    assert len(judge({"housingConditionIds": ["NONE", "HAS_DEPENDENT_FAMILY"]}, rules)) == 1


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


# ── 답에 따라 대표 제도가 갈린다 (기획서 §4.1) ──


def _usecase_with_graph() -> IntakeUseCase:
    return IntakeUseCase(
        JsonInstitutionRepository(),
        JsonIntakeRuleRepository().all(),
        graph_nodes=JsonGraphRepository().nodes(),
    )


def test_blocked_account_gets_unblock_not_new_account() -> None:
    """**"통장은 있지만 쓰기 어려워요"에 "계좌를 새로 만드세요"가 나가던 문제.**

    첫 화면에서 읽는 것이 카드 제목과 요약이라, 대표가 틀리면 사용자는 틀린 것을
    먼저 읽는다. 갈림은 그래프의 for_state가 정본이다.
    """
    tasks = _usecase_with_graph().run({"bankAccountStatus": "UNUSABLE"})
    card = next(t for t in tasks if t.route_id == "R10").card
    assert card.institution_id == "identity-bank-account-unblock"


def test_missing_account_still_gets_new_account() -> None:
    tasks = _usecase_with_graph().run({"bankAccountStatus": "NONE"})
    card = next(t for t in tasks if t.route_id == "R10").card
    assert card.institution_id == "identity-bank-account"


def test_routes_without_a_fork_keep_their_lead() -> None:
    """갈림이 없는 항목은 노드가 없어도 된다. 기본 대표가 그대로 나간다."""
    tasks = _usecase_with_graph().run({"startupIntent": "WANT"})
    card = next(t for t in tasks if t.route_id == "R7").card
    assert card.institution_id == "startup-koreha-support"


def test_answer_cannot_be_both_resolved_and_blocked(tmp_path: Path) -> None:
    """한 답이 양쪽에 적히면 어느 쪽인지 알 수 없다 — 로더가 부팅을 멈춘다."""
    rules = [
        {
            "route_id": r.value,
            "data_key": f"key_{r.value}",
            "resolved_options": ["UNUSABLE"] if r is RouteId.R10 else [],
            "blocked_options": ["UNUSABLE"] if r is RouteId.R10 else [],
        }
        for r in RouteId
    ]
    broken = tmp_path / "rules.json"
    broken.write_text(json.dumps({"rules": rules}, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(ValueError, match="해결과 막힘에 모두"):
        JsonIntakeRuleRepository(broken)


# ── 4값에 담기지 않는 갈림은 규칙표가 지정한다 (기획서 §4.1) ──


def _usecase_with_rules(*rules: IntakeRule) -> IntakeUseCase:
    """규칙을 직접 끼워 넣는다. 로더는 14개를 다 요구하므로 여기서는 우회한다."""
    return IntakeUseCase(
        JsonInstitutionRepository(),
        rules,
        graph_nodes=JsonGraphRepository().nodes(),
    )


def test_rule_table_picks_the_card_when_the_graph_cannot() -> None:
    """**진행 단계는 O/X/△/? 넷 중 어느 것도 아니다.**

    "법원에 신청해 진행 중"을 BLOCKED로 돌려쓰면 그 값의 뜻이 늘어나 나중에 어느
    의미로 쓴 것인지 알 수 없게 된다. 그래서 그래프가 답하지 못하는 갈림은
    규칙표가 제도를 직접 가리킨다.
    """
    usecase = _usecase_with_rules(
        IntakeRule(
            route_id=RouteId.R14,
            data_key="debtProcedureStage",
            lead_by_option={"COURT_PROCESS": "debt-legal-aid"},
        )
    )
    court = usecase.run({"debtProcedureStage": "COURT_PROCESS"})
    assert court[0].card.institution_id == "debt-legal-aid"

    # 표에 없는 답은 기본 대표 그대로다.
    other = usecase.run({"debtProcedureStage": "NOT_STARTED"})
    assert other[0].card.institution_id == "debt-credit-recovery"


def test_graph_wins_when_both_answer() -> None:
    """겹치면 그래프가 이긴다. 같은 갈림이 두 군데 적히는 날이 와도
    조용히 어느 한쪽으로 갈리지 않게 한다."""
    usecase = _usecase_with_rules(
        IntakeRule(
            route_id=RouteId.R10,
            data_key="bankAccountStatus",
            blocked_options=frozenset({"UNUSABLE"}),
            # 그래프는 BLOCKED에 unblock을 준다. 규칙표가 다른 것을 가리켜도 진다.
            lead_by_option={"UNUSABLE": "identity-bank-account"},
        )
    )
    tasks = usecase.run({"bankAccountStatus": "UNUSABLE"})
    assert tasks[0].card.institution_id == "identity-bank-account-unblock"


def test_multiple_choice_never_picks_a_card() -> None:
    """둘을 고르면 어느 쪽 제도인지 정할 근거가 없다. 조용히 하나를 고르지 않는다."""
    usecase = _usecase_with_rules(
        IntakeRule(
            route_id=RouteId.R14,
            data_key="debtProcedureStage",
            lead_by_option={"COURT_PROCESS": "debt-legal-aid"},
        )
    )
    tasks = usecase.run({"debtProcedureStage": ["COURT_PROCESS", "STOPPED"]})
    assert tasks[0].card.institution_id == "debt-credit-recovery"


def test_unknown_card_id_falls_back_and_warns(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """규칙표가 KB에 없는 제도를 가리키면 기본 대표로 답하되 조용히 넘기지 않는다."""
    usecase = _usecase_with_rules(
        IntakeRule(
            route_id=RouteId.R14,
            data_key="debtProcedureStage",
            lead_by_option={"COURT_PROCESS": "없는-제도"},
        )
    )
    with caplog.at_level("WARNING"):
        tasks = usecase.run({"debtProcedureStage": "COURT_PROCESS"})
    assert tasks[0].card.institution_id == "debt-credit-recovery"
    assert "없는-제도" in caplog.text
