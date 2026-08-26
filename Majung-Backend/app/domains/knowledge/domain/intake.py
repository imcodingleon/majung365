"""초기 진단 판정 — 순수 Python (Domain).

27문항 답변에서 "지금 무엇이 할 일인가"를 가린다.
계약: _bmad-output/specs/spec-majung-2nd/intake-questions.md

핵심 구조는 단순하다. **필수 문항 14개가 지원 항목 14개와 1:1로 대응한다.**
그래서 판정은 "그 항목의 필수 문항에 답이 왔는가, 그 답이 이미 해결된 상태인가"로 끝난다.

주의할 것 하나. **화면에 보이지 않은 문항의 답은 오지 않는다**(기획서 §3.8).
답을 바꿔 꼬리질문이 닫히면 그 답이 payload에서 빠지므로, 서버는 특정 키가 항상
온다고 가정하면 안 된다. 사용자가 철회한 정보를 붙들지 않으려는 설계다.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field

from app.domains.knowledge.domain.graph_engine import NodeState
from app.domains.shared.routes import RouteId, SectionId, order_of, section_of


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
    # 답변별 대표 제도. **4값에 담기지 않는 갈림을 여기서 다룬다.**
    #
    # 보유 상태 넷은 "갖췄나·못 갖췄나·있는데 못 쓰나·모르나"만 말한다. 채무 절차가
    # 법원에서 진행 중인지 신용회복위원회인지 멈췄는지는 그중 어느 것도 아니다.
    # `BLOCKED`를 "진행 중"으로 돌려쓰면 그 값의 뜻이 늘어나 나중에 어느 의미로 쓴
    # 것인지 알 수 없게 된다.
    #
    # **그래프가 답할 수 있는 갈림은 여기 적지 않는다.** 같은 사실이 두 군데 적히면
    # 언젠가 한쪽만 고치는 날이 온다. 겹치면 그래프가 이긴다(§4.1).
    lead_by_option: Mapping[str, str] = field(default_factory=dict)
    # lead_by_option이 볼 문항. 비면 data_key의 답을 본다.
    #
    # **꼬리질문의 답으로 갈려야 하는 자리가 있다.** 통장이 막힌 사유(Q3-2-1)가
    # 압류인지 한도제한인지 은행 자체 제한인지는 필수 문항이 아니라 꼬리질문이
    # 묻는다. 그런데 셋의 답이 전혀 다르다 — **압류는 은행이 풀어줄 수 없다.**
    # 필수 문항의 답만 보면 셋이 한 덩어리가 되어 틀린 안내가 나간다.
    lead_data_key: str = ""


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
    # 사용자가 고른 용도를 문장에 넣을 형태로. 예: "병원비"
    #
    # **답변이 아니라 답변으로 내린 판단이다.** 그래서 판정에 담아 함께
    # 저장한다 — 세션 복원에는 답변이 없어서(0008), 여기 없으면 새로고침
    # 뒤에 준비물 문구가 일반형으로 조용히 돌아간다.
    purpose: str = ""
    # 규칙표가 답변을 보고 지정한 제도. 그래프가 답하지 못하는 갈림에 채워진다.
    lead_override: str = ""
    # 그 지정이 꼬리질문까지 보고 내린 것인가.
    #
    # **꼬리질문을 본 판정은 그래프를 이긴다.** 그래프는 보유 상태 넷만 알아서
    # "막혔다"까지밖에 말하지 못하는데, 꼬리질문은 왜 막혔는지를 안다. 압류와
    # 은행 자체 제한은 할 일이 정반대라, 덜 아는 쪽이 이기면 틀린 안내가 나간다.
    override_is_specific: bool = False


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


def _lead_override(answers: dict[str, object], rule: IntakeRule) -> str:
    """답변이 제도를 직접 가리키는 경우. **복수선택에는 쓰지 않는다** —
    둘을 고르면 어느 쪽 제도인지 정할 근거가 없고, 조용히 하나를 고르면 안 된다.

    꼬리질문을 보는 규칙은 그 답이 오지 않았을 수 있다(§3.8). 화면에 안 보였거나
    사용자가 답을 바꿔 닫혔다는 뜻이므로, 없으면 기본 대표로 둔다.
    """
    if not rule.lead_by_option:
        return ""
    answer = answers.get(rule.lead_data_key or rule.data_key)
    if not isinstance(answer, str):
        return ""
    return rule.lead_by_option.get(answer, "")


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
                lead_override=_lead_override(answers, rule),
                override_is_specific=bool(rule.lead_data_key),
            )
        )

    # **적어 둔 항목 순서를 따른다** (2026-08-26 결정 H-1). 예전에는 "막힌 항목 먼저,
    # 그다음 분야 순서"였는데, 지금 순서는 분야가 뒤섞여 있어 그 규칙으로 나오지 않는다.
    #
    # `blocks_others`는 여기서 안 보지만 값은 그대로 실려 나간다 — 카드의 "먼저 하면
    # 좋아요" 배지와 §5.2의 탭 잠금이 그 값을 쓴다.
    return tuple(sorted(verdicts, key=lambda v: order_of(v.route_id)))
