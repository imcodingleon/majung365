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
    # 이 경로가 어느 지원 항목의 것인가. **한 노드가 두 항목을 겸할 때만 적는다.**
    #
    # "잘 곳"(shelter)이 R1 숙식제공과 R4 주거지원을 함께 달고 있는데, 경로를
    # 항목으로 가르지 않으면 미충족 개수가 같은 두 경로 중 먼저 선언된 쪽이 뽑혀
    # **R4가 R1과 똑같은 카드를 냈다.** 비어 있으면 노드의 모든 항목에 해당한다.
    route_ids: tuple[str, ...]
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
    node: GraphNode,
    state: NodeState,
    satisfied: set[str],
    route_id: str | None = None,
) -> ObtainPath | None:
    """for_state에 맞는 경로 중, 지금 시점 기준 미충족 선행조건이 가장 적은 경로를 고른다.

    route_id를 주면 **그 항목의 경로만 본다.** 한 노드가 두 항목을 겸할 때
    항목별로 다른 답이 나와야 하는데, 가르지 않으면 먼저 선언된 경로가 둘 다 이긴다.
    """
    candidates = _candidate_paths(node, state)
    if route_id is not None:
        # 항목을 적지 않은 경로는 노드의 모든 항목에 해당한다 — 겸하지 않는
        # 노드에 일일이 적게 하면 데이터만 늘고 틀릴 자리가 생긴다.
        owned = tuple(p for p in candidates if not p.route_ids or route_id in p.route_ids)
        if owned:
            candidates = owned
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


def routes_blocking_others(nodes: dict[str, GraphNode]) -> frozenset[str]:
    """다른 노드의 선행조건으로 참조되는 노드들의 지원 항목 코드.

    사용자 상태와 무관한 정적 계산이다 — 그래프 구조 자체의 사실이라 누가 물어도 답이 같다.
    챗의 triage가 "이걸 먼저 해두면 다음 일들이 수월해져요"를 말할 근거로 쓴다.
    compute_starting_task의 unlocks()와 달리 여기서는 현재 충족 상태를 보지 않는다.
    """
    required: set[str] = set()
    for node in nodes.values():
        for path in node.obtain:
            for req in path.requires:
                required.add(req.node)
    return frozenset(
        route for nid in required for route in nodes[nid].route_ids if nid in nodes
    )


def route_precedence(nodes: dict[str, GraphNode]) -> frozenset[tuple[str, str]]:
    """(먼저 해야 하는 항목, 나중 항목) 쌍. **사용자 상태와 무관한 그래프 구조의 사실이다.**

    `routes_blocking_others`가 "이 항목이 다른 것을 연다"까지만 말하는 데 비해,
    여기는 **어느 항목이 어느 항목보다 앞서야 하는지**를 낸다. 순서를 LLM이 정하게
    되면서(2026-09-02 결정) 그 답이 말이 되는지 검사할 근거가 필요해졌다.

    **경로의 항목으로 가른다.** "잘 곳"(shelter)이 R1과 R4를 겸하는데 가르지 않으면
    R4 경로의 선행조건(신분증)이 R1에도 붙어 없는 제약이 생긴다 — `_select_path`가
    이미 같은 이유로 route_id를 본다.

    노드는 있는데 선행조건이 가리키는 노드가 없는 데이터는 건너뛴다. 그래프가 덜
    채워졌다고 순서 검증이 통째로 죽으면 안 된다.
    """
    pairs: set[tuple[str, str]] = set()
    for node in nodes.values():
        for path in node.obtain:
            # 항목을 적지 않은 경로는 노드의 모든 항목에 해당한다(_select_path와 같은 규칙).
            targets = path.route_ids or node.route_ids
            for req in path.requires:
                source = nodes.get(req.node)
                if source is None:
                    continue
                for before in source.route_ids:
                    for after in targets:
                        if before != after:
                            pairs.add((before, after))
    return frozenset(pairs)


def kb_ref_for_route(
    nodes: dict[str, GraphNode], route_id: str, state: NodeState
) -> str | None:
    """그 지원 항목을 그 상태에서 다룰 때 어느 제도가 대표인가.

    **초기 진단이 상태별 갈림을 그래프에서 받아 가는 자리다**(기획서 §4.1).
    "통장은 있지만 쓰기 어려워요"에 "계좌를 새로 만드세요"가 나가던 문제를 여기서
    막는다. 규칙표는 답변을 상태로 옮기는 데까지만 하고, 상태로 제도를 고르는 것은
    `for_state`가 정본이다.

    노드가 없거나 그 상태에 맞는 경로가 없으면 None이다. 그러면 부르는 쪽이 항목의
    기본 대표(`lead_of`)를 쓴다 — 갈림이 없는 항목은 노드도 필요 없기 때문이다.

    선행조건 충족 여부는 보지 않는다. 초기 진단은 "무엇부터"가 아니라 "무엇이 할
    일인가"를 내고, 순서는 `blocks_others`가 이미 맡고 있다.
    """
    matched = [n for n in nodes.values() if route_id in n.route_ids]
    if len(matched) != 1:
        # 한 항목에 노드가 둘 이상이면 어느 쪽 경로를 따를지 정할 근거가 없다.
        # 조용히 하나를 고르지 않고 기본 대표로 물러난다.
        return None
    # **반대 방향도 막는다** — 한 노드가 항목 둘을 겸하면 항목으로 경로를 가른다.
    path = _select_path(matched[0], state, satisfied=set(), route_id=route_id)
    return path.kb_ref if path else None


def referenced_kb_refs(nodes: dict[str, GraphNode]) -> frozenset[str]:
    """그래프의 어느 경로든 가리키는 제도 id 전부.

    KB에 있으나 아무도 가리키지 않는 제도를 찾아내는 데 쓴다.
    """
    return frozenset(path.kb_ref for node in nodes.values() for path in node.obtain)
