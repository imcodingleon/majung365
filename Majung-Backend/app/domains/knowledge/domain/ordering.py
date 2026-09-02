"""할 일 순서 — 모델이 정하고 서버가 검사한다 (2026-09-02 결정).

`SSOT.md` §4.2가 "순서 계산을 LLM이 아닌 코드로 둔다"고 정했던 것을 뒤집는다.
그 문서가 든 근거 셋을 여기서 각각 막는다.

1. **같은 입력에 다른 순서가 나온다** → 순서를 매번 묻지 않는다. 가입과 재진단
   때 한 번 정해 판정과 함께 저장하고, 복원은 저장된 순서를 그대로 읽는다.
   결정성을 모델에게서 얻지 않고 저장에서 얻는다.
2. **응답이 느려진다** → 받는 것이 항목 코드 목록뿐이라 토큰이 거의 없다.
   낮은 추론 강도로 부르고 시간이 넘으면 기다리지 않고 지금까지의 순서로 간다.
3. **잘못된 순서가 사용자를 헛걸음시킨다** → `validate_order`가 두 가지를 본다.
   항목이 빠지거나 없는 것이 섞이지 않았는지, 선행조건을 어기지 않았는지.
   어긋나면 반쯤 고치지 않고 통째로 물러난다.

**모델에게 이유를 쓰게 하지 않는다.** 코드 목록만 받는다. 자유 문구에 수용
사유가 실리는 문제는 `prompts.py` 머리말이 적어 둔 그대로이며, 카드에 수용 사유를
노출하기로 한 결정은 **서버가 쓴 검수된 문장**에 대한 것이지 모델이 즉석에서 쓰는
문장에 대한 것이 아니다.
"""

import json
from collections.abc import Sequence
from dataclasses import dataclass

from app.domains.knowledge.domain.graph_engine import NodeState
from app.domains.knowledge.domain.intake import IntakeVerdict
from app.domains.shared.routes import ROUTE_ORDER, RouteId, order_of

# 받는 것은 항목 코드 배열 하나뿐이다.
#
# **`maxItems`를 쓰지 않는다** — Anthropic 구조화 출력이 배열에서 그 키워드를 받지
# 않아 400으로 막힌다(`visit/domain/summary.py`가 같은 이유로 적어 두었다).
# 개수는 프롬프트로 부탁하고, 어긋나면 `validate_order`가 잡는다.
ORDER_SCHEMA = {
    "type": "object",
    "properties": {
        "order": {
            "type": "array",
            "items": {"type": "string"},
            "description": "받은 항목 코드를 할 순서대로. 전부, 한 번씩만.",
        }
    },
    "required": ["order"],
    "additionalProperties": False,
}

ORDER_INSTRUCTION = """당신은 마중365의 순서 결정기입니다.
막 출소한 분이 오늘부터 무엇을 어떤 차례로 하면 가장 덜 헛걸음할지, 그 차례만 정하세요.

정하는 방법:
- 기한이 있는 것을 앞에 둡니다. 놓치면 자격 자체가 사라집니다.
- 다른 일을 열어 주는 것을 앞에 둡니다. 증명서가 없으면 뒤가 전부 막힙니다.
- 같은 조건이면 빨리 끝나는 것을 앞에 둡니다. 첫 성공이 빨라야 다음을 합니다.
- 수용 사유 때문에 오래 걸리거나 별도 절차가 필요한 것은 그만큼 먼저 시작해야 합니다.
  막힌 것을 뒤로 미루지 마세요. 미루면 그분은 마지막 날에 그것을 만납니다.

지켜야 할 것:
- 받은 항목 코드를 전부, 한 번씩만 씁니다. 없는 코드를 만들지 않습니다.
- "먼저 해야 하는 것"을 어기지 않습니다. 어기면 답이 통째로 버려집니다.
- 이유를 쓰지 않습니다. 코드 목록만 돌려주세요."""

# 보유 상태를 사람이 읽는 말로. 코드값(X·BLOCKED)을 그대로 보내면 모델이
# "차단됨"으로 읽어 실제보다 무겁게 다룬다.
_STATE_TEXT = {
    NodeState.X: "아직 없는 상태",
    NodeState.BLOCKED: "가지고 계시지만 지금은 쓸 수 없는 상태",
    NodeState.UNKNOWN: "확실하지 않은 상태",
    NodeState.O: "이미 갖춘 상태",
}


@dataclass(frozen=True)
class OrderItem:
    """순서를 정할 항목 하나. **여기 담기는 값은 전부 열거값과 상수에서 온다.**

    답변 원문이 한 글자라도 섞이면 마스킹을 우회해서 나간다 —
    `chat/domain/user_context.py`가 같은 이유로 `purpose`를 뺐다.
    """

    route_id: str
    label: str
    state: NodeState
    has_deadline: bool = False
    deadline_text: str = ""
    # 그 항목에 붙은 수용 사유 제약의 요약. 검수된 문장의 headline만 쓴다.
    notice_lines: tuple[str, ...] = ()


def build_order_input(
    items: Sequence[OrderItem],
    *,
    profile_line: str = "",
    precedence: Sequence[tuple[str, str]] = (),
) -> str:
    """모델에게 보낼 한 덩어리. 서버가 아는 사실만 담는다.

    담는 것: 연령대·출소 후 경과 일수·수용 사유 대분류(profile_line) · 항목 코드와
    이름과 보유 상태 · 기한 유무 · 선행조건 쌍 · 검수된 제약의 제목.
    담지 않는 것: 이름 · 생년월일 · 출소날짜 원본 · 답변 원문 · 사용자가 고른 용도.
    """
    lines: list[str] = []
    if profile_line:
        lines.append(f"[이분에 대해]\n{profile_line}\n")

    lines.append("[정해야 할 순서 — 아래 항목만, 전부, 한 번씩]")
    for it in items:
        row = f"{it.route_id} {it.label} — {_STATE_TEXT.get(it.state, '아직 없는 상태')}"
        if it.has_deadline:
            row += f" · 기한 있음({it.deadline_text})" if it.deadline_text else " · 기한 있음"
        lines.append(row)
        for n in it.notice_lines:
            lines.append(f"    수용 사유에 따라 달라지는 점: {n}")

    if precedence:
        lines.append("\n[먼저 해야 하는 것 — 이 순서를 어기면 답이 버려집니다]")
        for before, after in precedence:
            lines.append(f"{before}보다 {after}가 먼저 올 수 없습니다")

    return "\n".join(lines)


def parse_order(raw: str) -> tuple[str, ...]:
    """모델 응답에서 코드 목록만 꺼낸다. **실패하면 빈 튜플이다.**

    예외를 던지지 않는 이유는 부르는 쪽이 어차피 폴백으로 가기 때문이다 —
    실패 종류를 나눠 봐야 하는 일이 달라지지 않는다.
    """
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return ()
    order = data.get("order") if isinstance(data, dict) else None
    if not isinstance(order, list):
        return ()
    return tuple(str(x) for x in order if isinstance(x, str))


def checkable_precedence(
    pairs: frozenset[tuple[str, str]],
) -> tuple[tuple[str, str], ...]:
    """선행조건 쌍 중 **검사에 쓸 수 있는 것만** 고른다.

    그래프와 `ROUTE_ORDER`(2026-08-26 결정 H-1)는 지금 세 자리에서 어긋난다.
    잘 곳 → 주소 → 신분증이 고리를 이루는데(`graph-design.md` §4), 손으로 적은
    목록 순서는 신분증을 주민등록보다 앞에 둔다.

    **어긋나는 쌍을 검사에 쓰면 폴백조차 통과하지 못한다.** 그러면 모델이 무엇을
    내놓든 검증이 늘 실패해 검사가 있으나 마나가 된다. 그래서 지금까지의 순서도
    지키는 쌍만 남긴다 — 확실한 것만으로 재는 편이 아무것도 못 재는 것보다 낫다.

    어긋나는 쌍의 목록은 `tests/test_graph_engine.py`가 고정하고 있어서, 그래프나
    목록 순서가 바뀌면 그쪽이 먼저 알린다.
    """
    rank = {r.value: i for i, r in enumerate(ROUTE_ORDER)}
    return tuple(
        sorted(
            (b, a)
            for b, a in pairs
            if b in rank and a in rank and rank[b] < rank[a]
        )
    )


def validate_order(
    proposed: Sequence[str],
    verdicts: Sequence[IntakeVerdict],
    precedence: Sequence[tuple[str, str]] = (),
) -> tuple[RouteId, ...] | None:
    """받아들일 수 있으면 그 순서를, 아니면 None을 돌려준다.

    **None이면 부르는 쪽이 지금까지의 순서로 간다. 반쯤 고쳐 쓰지 않는다** —
    무엇이 어긋났는지 모르는 채 일부만 살리면 왜 그 순서인지 아무도 설명할 수 없다.

    돌려주는 실패 사유는 없다. 부르는 쪽이 하는 일이 같고, 어느 항목이 어긋났는지를
    로그에 남기면 **어떤 항목이 배정됐는지가 곧 그 사람의 상황**이라는 문제가
    생긴다(`0008_intake_state.sql`).
    """
    wanted = {v.route_id.value for v in verdicts}

    if len(proposed) != len(wanted):
        return None
    if set(proposed) != wanted:
        return None

    place = {code: i for i, code in enumerate(proposed)}
    for before, after in precedence:
        if before in place and after in place and place[before] > place[after]:
            return None

    return tuple(RouteId(code) for code in proposed)


def fallback_order(verdicts: Sequence[IntakeVerdict]) -> tuple[RouteId, ...]:
    """지금까지의 순서 그대로다 (2026-08-26 결정 H-1).

    `ROUTE_ORDER`가 지원 항목 전체를 덮는 전순서라 답이 항상 있다. 모델을 못
    불렀거나 답이 어긋났을 때 여기로 온다.
    """
    return tuple(v.route_id for v in sorted(verdicts, key=lambda v: order_of(v.route_id)))


def reorder(
    verdicts: Sequence[IntakeVerdict], order: Sequence[RouteId]
) -> tuple[IntakeVerdict, ...]:
    """판정을 정해진 순서로 다시 늘어놓는다.

    **판정 목록의 순서가 곧 화면의 순서다.** 저장도 이 순서 그대로 되므로, 복원할
    때 다시 정할 필요가 없다(`intake_state.verdicts_enc`가 JSON 배열이다).
    """
    by_route = {v.route_id: v for v in verdicts}
    return tuple(by_route[r] for r in order if r in by_route)
