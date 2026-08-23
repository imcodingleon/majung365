"""초기 진단 판정 — 순수 Python (Domain).

27문항 답변에서 "지금 무엇이 할 일인가"를 가린다.
계약: _bmad-output/specs/spec-majung-2nd/intake-questions.md

핵심 구조는 단순하다. **필수 문항 14개가 지원 항목 14개와 1:1로 대응한다.**
그래서 판정은 "그 항목의 필수 문항에 답이 왔는가, 그 답이 이미 해결된 상태인가"로 끝난다.

주의할 것 하나. **화면에 보이지 않은 문항의 답은 오지 않는다**(기획서 §3.8).
답을 바꿔 꼬리질문이 닫히면 그 답이 payload에서 빠지므로, 서버는 특정 키가 항상
온다고 가정하면 안 된다. 사용자가 철회한 정보를 붙들지 않으려는 설계다.
"""

from dataclasses import dataclass

from app.domains.knowledge.domain.graph_engine import NodeState
from app.domains.shared.routes import RouteId, SectionId, section_of


@dataclass(frozen=True)
class IntakeRule:
    """지원 항목 하나를 가리는 규칙.

    **이 규칙이 하는 일은 답변을 보유 상태로 옮기는 데까지다.** 그 상태로 어떤
    제도를 낼지는 그래프(`graph.json`의 `for_state`)가 정한다. 여기서 제도까지
    정하면 같은 규칙이 두 군데 적히고, 언젠가 한쪽만 고치는 날이 온다.
    """

    route_id: RouteId
    data_key: str
    # 이 답을 골랐으면 이미 해결된 상태라 할 일에서 뺀다.
    # optionId 값이 기획 검토 중이라 비어 있을 수 있고, 비면 답이 온 이상 할 일로 잡는다.
    # 확정되면 데이터만 채우면 되고 코드는 그대로다.
    resolved_options: frozenset[str] = frozenset()
    # 있기는 한데 쓸 수 없는 상태(△). 통장이 압류나 한도제한으로 막힌 경우가 그렇다.
    #
    # **`resolved_options`와 짝을 이루는 나머지 반쪽이다.** 저쪽이 "이 답이면 O"를
    # 맡으니 이쪽이 "이 답이면 △"를 맡는다. 새 개념이 아니라 비어 있던 자리다.
    blocked_options: frozenset[str] = frozenset()


@dataclass(frozen=True)
class IntakeVerdict:
    """한 지원 항목에 대한 판정. 제도 원본과 섞지 않는다 —
    이쪽은 사람마다 다르고 제도 원본은 모든 사용자에게 같다."""

    route_id: RouteId
    section_id: SectionId
    # 다른 항목의 선행조건인가. 그래프 구조가 아는 사실이다.
    blocks_others: bool
    # 사용자가 지금 어떤 상태인가. **그래프가 경로를 고르는 입력이다.**
    # 답이 왔는데 해결도 막힘도 아니면 아직 없는 것(X)으로 본다.
    state: NodeState = NodeState.X


def _matches(answer: object, options: frozenset[str]) -> bool:
    """답이 그 묶음에 드는지. 복수선택은 고른 것이 전부 들 때만 참으로 본다 —
    하나라도 벗어나면 그 사람에게는 아직 그 상태가 아니다."""
    if not options:
        return False
    if isinstance(answer, str):
        return answer in options
    if isinstance(answer, (list, tuple)):
        return bool(answer) and all(str(v) in options for v in answer)
    return False


def _state_of(answer: object, rule: IntakeRule) -> NodeState:
    """답변을 보유 상태로 옮긴다.

    **해결을 먼저 본다.** 한 답이 양쪽에 다 적히는 일은 없어야 하지만, 그런 데이터가
    들어와도 "해결됨"이 이기는 편이 안전하다. 할 일을 하나 덜 내는 실수가
    이미 끝낸 일을 다시 시키는 실수보다 낫다.
    """
    if _matches(answer, rule.resolved_options):
        return NodeState.O
    if _matches(answer, rule.blocked_options):
        return NodeState.BLOCKED
    return NodeState.X


def judge(
    answers: dict[str, object],
    rules: tuple[IntakeRule, ...],
    blocking_routes: frozenset[str] = frozenset(),
) -> tuple[IntakeVerdict, ...]:
    """답변에서 할 일이 되는 지원 항목을 가린다.

    답이 오지 않은 문항은 그 항목을 만들지 않는다. 화면에 보이지 않아서일 수도,
    사용자가 그 분야를 아직 안 끝냈을 수도 있는데, 어느 쪽이든 **답하지 않은 것을
    할 일로 만들지는 않는다.**

    정렬은 선행조건인 항목이 먼저, 그다음 분야 순서다. 다음에 열릴 탭이 정해져야
    "6개 중 2개 완료"를 셀 수 있다(기획서 §5.2).
    """
    verdicts: list[IntakeVerdict] = []
    for rule in rules:
        if rule.data_key not in answers:
            continue
        state = _state_of(answers[rule.data_key], rule)
        if state == NodeState.O:
            continue
        verdicts.append(
            IntakeVerdict(
                route_id=rule.route_id,
                section_id=section_of(rule.route_id),
                blocks_others=rule.route_id.value in blocking_routes,
                state=state,
            )
        )

    section_order = {s: i for i, s in enumerate(SectionId)}
    return tuple(
        sorted(
            verdicts,
            key=lambda v: (not v.blocks_others, section_order[v.section_id]),
        )
    )
