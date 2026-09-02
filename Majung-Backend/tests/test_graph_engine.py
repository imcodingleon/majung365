"""C7 그래프 엔진 — graph-design.md §5 케이스 검증표 3건을 고정 테스트로 지킨다.

케이스가 깨지면 온보딩→오늘의 과제 흐름 전체가 SSOT와 어긋난다는 신호다.
"""

from app.domains.knowledge.domain.graph_engine import (
    NodeState,
    compute_starting_task,
    route_precedence,
)
from app.domains.knowledge.infrastructure.graph_repository import JsonGraphRepository
from app.domains.shared.routes import ROUTE_ORDER


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


# ── route_precedence — 순서 검증의 근거 (2026-09-02) ──────────────────────
#
# 할 일 순서를 LLM이 정하게 되면서, 그 답이 말이 되는지 볼 근거가 필요해졌다.
# 여기서 지키려는 것은 "쌍이 몇 개냐"가 아니라 **그래프와 ROUTE_ORDER가 어긋나는
# 자리가 지금 어디인지**다. 데이터가 바뀌면 이 테스트가 먼저 말한다.


def test_precedence_splits_shelter_by_route() -> None:
    """잘 곳은 R1과 R4의 선행조건이 다르다. 가르지 않으면 없는 제약이 생긴다.

    R1(숙식제공)은 출소증명서로 가고, R4(주거지원)는 신분증이 있어야 한다.
    노드가 하나라고 두 항목을 같이 재면 R1에도 신분증이 붙는다.
    """
    pairs = route_precedence(JsonGraphRepository().nodes())

    assert ("R13", "R1") in pairs
    assert ("R9", "R4") in pairs
    assert ("R9", "R1") not in pairs


def test_precedence_covers_id_card_dependents() -> None:
    """신분증이 열어 주는 것들. 이 관계가 사라지면 순서 검증이 헐거워진다."""
    pairs = route_precedence(JsonGraphRepository().nodes())

    for later in ("R2", "R10", "R12", "R14", "R15"):
        assert ("R9", later) in pairs


def test_precedence_conflicts_with_route_order_are_known() -> None:
    """**그래프와 ROUTE_ORDER는 지금 세 자리에서 어긋난다.**

    graph-design.md §4가 인정한 순환(잘 곳 → 주소 → 신분증 → 잘 곳)이 항목
    쌍으로 펼쳐지면서 드러난 것이다. 노드 수준에서는 출소증명서가 순환 밖에서
    양쪽에 들어가 고리를 끊지만, 항목 쌍에는 그 탈출구가 담기지 않는다.

    **어긋나는 쌍은 순서 검증에 쓰지 않는다.** 쓰면 폴백인 ROUTE_ORDER조차
    통과하지 못해 검증이 무의미해진다. 대신 그 목록을 여기 고정해서, 그래프나
    ROUTE_ORDER가 바뀌면 이 테스트가 먼저 알리게 한다.
    """
    pairs = route_precedence(JsonGraphRepository().nodes())
    rank = {r.value: i for i, r in enumerate(ROUTE_ORDER)}
    conflicts = {(b, a) for b, a in pairs if rank[b] > rank[a]}

    assert conflicts == {
        ("R11", "R9"),   # 주민등록이 있어야 신분증이 나오는데 순서는 반대다
        ("R11", "R12"),  # 같은 순환에 딸려 온다
        ("R10", "R12"),  # 통장이 있어야 생계급여인데 순서는 반대다
    }


def test_precedence_skips_dangling_requirements() -> None:
    """선행조건이 없는 노드를 가리켜도 죽지 않는다.

    그래프가 덜 채워졌다고 순서 검증이 통째로 멈추면, 그 뒤로는 무엇을 내놓아도
    폴백만 나간다. 조용히 건너뛰고 아는 것만 잰다.
    """
    nodes = JsonGraphRepository().nodes()
    del nodes["proof_of_release"]

    pairs = route_precedence(nodes)

    assert all(before != "R13" for before, _ in pairs)
    assert ("R9", "R10") in pairs
