"""C7 그래프 엔진 — graph-design.md §5 케이스 검증표 3건을 고정 테스트로 지킨다.

케이스가 깨지면 온보딩→오늘의 과제 흐름 전체가 SSOT와 어긋난다는 신호다.
"""

from app.domains.knowledge.domain.graph_engine import NodeState, compute_starting_task
from app.domains.knowledge.infrastructure.graph_repository import JsonGraphRepository


def test_case1_all_x_starts_at_proof_of_release() -> None:
    nodes = JsonGraphRepository().nodes()
    states = {nid: NodeState.X for nid in nodes}

    task = compute_starting_task(nodes, states)

    assert task.node_id == "proof_of_release"
    assert not task.is_fallback


def test_case2_id_card_only_starts_at_emergency_cash() -> None:
    nodes = JsonGraphRepository().nodes()
    states = {nid: NodeState.X for nid in nodes}
    states["id_card"] = NodeState.O

    task = compute_starting_task(nodes, states)

    assert task.node_id == "emergency_cash"
    assert task.deadline_text == "출소일부터 6개월"
    assert not task.is_fallback


def test_case3_bank_account_blocked_starts_at_unblock() -> None:
    nodes = JsonGraphRepository().nodes()
    states = {nid: NodeState.O for nid in nodes}
    states["bank_account"] = NodeState.BLOCKED

    task = compute_starting_task(nodes, states)

    assert task.node_id == "bank_account"
    assert task.action == "통장 정지 풀기"
    assert task.kb_ref == "identity-bank-account-unblock"
    assert not task.is_fallback


def test_all_satisfied_falls_back_to_proof_of_release() -> None:
    """이론상 데드락(후보 0) 방어 경로 — 전부 O면 proof_of_release로 폴백."""
    nodes = JsonGraphRepository().nodes()
    states = {nid: NodeState.O for nid in nodes}

    task = compute_starting_task(nodes, states)

    assert task.node_id == "proof_of_release"
    assert task.is_fallback
    assert task.priority_reason == "다른 서류 없이 진행할 수 있어요."
