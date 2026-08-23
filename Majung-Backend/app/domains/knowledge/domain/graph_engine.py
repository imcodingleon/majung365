"""C7 — 선행조건 그래프 엔진. 순수 Python (Domain), LLM 의존 없음.

절차(SSOT §6.3 · graph-design.md §2):
① 상태 정규화 — BLOCKED·UNKNOWN은 경로 선택 시 X로 취급(단, BLOCKED 전용 경로가 있으면 그걸 우선)
② 만족 마킹 — 상태가 O인 노드만 '충족'
③ 위상 정렬 — 유효 선행조건(미충족 선행조건이 가장 적은 경로의 requires)이
   전부 충족된, 아직 미충족인 노드 = 후보
④ 순환 검출 — 후보가 없으면 데드락 → proof_of_release로 폴백
⑤ 우선순위 — 기한 임박 > 해금 수 > 소요기간 짧음 순으로 1개 선택

복잡도 O(V+E) — 노드/경로 수가 늘어도 선형.
"""

from dataclasses import dataclass
from enum import StrEnum

_FALLBACK_NODE_ID = "proof_of_release"


class NodeState(StrEnum):
    O = "O"  # noqa: E741 — SSOT 원문 표기(O/X/△/?)를 그대로 코드 상태값으로 씀
    X = "X"
    BLOCKED = "BLOCKED"  # △ — 있으나 사용 불가
    UNKNOWN = "UNKNOWN"  # ? — 모름


@dataclass(frozen=True)
class Requirement:
    node: str
    confidence: str  # "confirmed" | "assumed"
    basis: str


@dataclass(frozen=True)
class ObtainPath:
    for_state: tuple[str, ...]
    action: str
    kb_ref: str
    where: str
    docs: tuple[str, ...]
    duration_days: int
    requires: tuple[Requirement, ...]


@dataclass(frozen=True)
class Deadline:
    text: str
    confidence: str
    basis: str
    # "tight"(며칠 단위 — 진짜 급함) | "moderate"(몇 개월 단위 — 여유 있지만 잊으면 안 됨)
    urgency: str = "tight"


@dataclass(frozen=True)
class GraphNode:
    id: str
    name: str
    # 이 노드가 근거가 되는 지원 항목들. 한 노드가 여러 항목에 걸칠 수 있다(예: 잘 곳 → R1·R4).
    route_ids: tuple[str, ...]
    tier: str
    deadline: Deadline | None
    obtain: tuple[ObtainPath, ...]


@dataclass(frozen=True)
class StartingTask:
    node_id: str
    node_name: str
    action: str
    kb_ref: str
    where: str
    docs: tuple[str, ...]
    duration_days: int
    deadline_text: str | None
    priority_reason: str
    unlocks_count: int
    is_fallback: bool


def _candidate_paths(node: GraphNode, state: NodeState) -> tuple[ObtainPath, ...]:
    """상태에 맞는 경로들. BLOCKED 전용 경로가 없으면 X 경로로 대체(정규화)."""
    state_key = state.value if state != NodeState.UNKNOWN else NodeState.X.value
    matching = tuple(p for p in node.obtain if state_key in p.for_state)
    if not matching and state_key != NodeState.X.value:
        matching = tuple(p for p in node.obtain if NodeState.X.value in p.for_state)
    return matching


def _select_path(
    node: GraphNode, state: NodeState, satisfied: set[str]
) -> ObtainPath | None:
    """for_state에 맞는 경로 중, 지금 시점 기준 미충족 선행조건이 가장 적은 경로를 고른다."""
    candidates = _candidate_paths(node, state)
    if not candidates:
        return None

    def unmet_count(path: ObtainPath) -> int:
        return sum(1 for r in path.requires if r.node not in satisfied)

    return min(candidates, key=unmet_count)


def _unmet_requirements(
    node: GraphNode, state: NodeState, satisfied: set[str]
) -> tuple[Requirement, ...]:
    path = _select_path(node, state, satisfied)
    if path is None:
        return ()
    return tuple(r for r in path.requires if r.node not in satisfied)


def compute_starting_task(
    nodes: dict[str, GraphNode],
    states: dict[str, NodeState],
) -> StartingTask:
    """현재 보유 상태로부터 지금 실행 가능한 시작 과제 1개를 산출한다."""
    satisfied = {nid for nid, st in states.items() if st == NodeState.O}

    def state_of(nid: str) -> NodeState:
        return states.get(nid, NodeState.UNKNOWN)

    def is_candidate(nid: str) -> bool:
        if nid in satisfied:
            return False
        node = nodes[nid]
        return len(_unmet_requirements(node, state_of(nid), satisfied)) == 0

    candidates = [nid for nid in nodes if is_candidate(nid)]

    is_fallback = False
    if not candidates:
        # ④ 순환 해소 불가 — 진입점(proof_of_release)으로 폴백 (SSOT §9 폴백②)
        candidates = [_FALLBACK_NODE_ID]
        is_fallback = True

    def unlocks(nid: str) -> int:
        """이 노드가 충족되면 몇 개 노드의 선택 경로가 선행조건을 더 채우는지(해금 수 근사치)."""
        count = 0
        for other in nodes.values():
            if other.id == nid:
                continue
            path = _select_path(other, state_of(other.id), satisfied)
            if path and any(r.node == nid for r in path.requires):
                count += 1
        return count

    def has_deadline(nid: str) -> bool:
        return nodes[nid].deadline is not None

    def duration(nid: str) -> int:
        path = _select_path(nodes[nid], state_of(nid), satisfied)
        return path.duration_days if path else 0

    # ⑤ 우선순위: 기한 임박 > 해금 수 > 소요기간 짧음(짧을수록 우선이라 음수로 반전)
    best = max(candidates, key=lambda nid: (has_deadline(nid), unlocks(nid), -duration(nid)))

    node = nodes[best]
    path = _select_path(node, state_of(best), satisfied)
    reason = _build_priority_reason(
        is_fallback=is_fallback,
        deadline=node.deadline,
        unlocks_count=unlocks(best),
    )

    return StartingTask(
        node_id=node.id,
        node_name=node.name,
        action=path.action if path else "",
        kb_ref=path.kb_ref if path else "",
        where=path.where if path else "",
        docs=path.docs if path else (),
        duration_days=path.duration_days if path else 0,
        deadline_text=node.deadline.text if node.deadline else None,
        priority_reason=reason,
        unlocks_count=unlocks(best),
        is_fallback=is_fallback,
    )


def _build_priority_reason(
    *, is_fallback: bool, deadline: Deadline | None, unlocks_count: int
) -> str:
    """카드 상단 한 줄 설명. 앱이 스스로 판단을 설명하는 문장은 쓰지 않는다 —
    실제로 새 정보(서류 불필요)가 있을 때만 채우고, 그 외엔 빈 문자열로 둔다.
    기한은 이 문장이 아니라 카드의 기한 배너가 전담한다(중복 설명 금지).
    """
    if is_fallback:
        return "다른 서류 없이 진행할 수 있어요."
    return ""
