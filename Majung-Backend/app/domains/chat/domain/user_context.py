"""초기 진단 판정을 프롬프트 블록으로 옮긴다 — 순수 Python (Domain).

같은 안내가 사람마다 달라져야 하는 자리가 있다. 통장을 이미 만든 사람에게
"통장을 만드세요"가 나가면 그 답은 틀린 것은 아니지만 쓸모가 없다. 모델에게
가는 정보가 이름과 대화 내역뿐이라 그런 답이 나왔다.

**자유 텍스트를 담지 않는다.** 여기서 나가는 문자열은 전부 `ROUTE_LABELS`와
`NodeState` 열거값에서 조립한 것이다. 마스킹 계층은 사용자가 쓴 글만 훑고
서버가 붙이는 블록은 지나치므로(`infrastructure/security/masking.py` 머리말),
이 자리에 답변 원문이 한 글자라도 섞이면 마스킹을 우회해서 나간다.

**담지 않기로 한 것 둘** (루트 `CLAUDE.md` 전역 규칙 1 · 데이터 최소화)

- `IntakeVerdict.purpose` — "병원비"처럼 답변을 보고 내린 용도 판단이다. 보유
  상태와 달리 상황 서술이라 그 자체로 사람을 좁힌다.
- 항목 14개 전체의 보유 상태 표 — 한 블록에 모으면 "신분증도 통장도 주소도
  없다"가 되고, 그것은 출소 사실보다 구체적인 취약성 목록이다. **지금 보고 있는
  항목 하나의 상태와 나머지 항목의 이름까지가 상한이다.**

`IntakeState`는 애초에 답변 원문을 담지 않도록 설계되어 있고(`knowledge/domain/
state.py` 머리말), 죄목은 그 구조에 아예 들어오지 않는다.
"""

from app.domains.knowledge.domain.graph_engine import NodeState
from app.domains.knowledge.domain.state import IntakeState
from app.domains.shared.routes import RouteId, label_for, order_of

# 보유 상태를 사람 말로. **조사를 붙이지 않는 형태로 적는다** — 항목 이름이
# 받침으로 끝나기도 하고 아니기도 해서, "은/는"을 넣으면 둘 중 하나가 틀린다.
_STATE_PHRASE: dict[NodeState, str] = {
    NodeState.O: "이미 갖추신 상태입니다",
    NodeState.X: "아직 없는 상태입니다",
    NodeState.BLOCKED: "가지고 계시지만 지금은 쓸 수 없는 상태입니다",
    NodeState.UNKNOWN: "갖추셨는지 아직 확인되지 않았습니다",
}


def _ordered_labels(routes: list[RouteId]) -> str:
    """할 일 목록과 같은 순서로 이름만 잇는다. 순서가 화면과 다르면
    "세 번째 것부터 하세요" 같은 안내가 어긋난다."""
    return ", ".join(label_for(r) for r in sorted(routes, key=order_of))


def build_user_context(state: IntakeState | None, pinned: RouteId | None) -> str:
    """진단 판정을 프롬프트에 붙일 블록으로. 판정이 없으면 빈 문자열이다.

    가입하지 않고도 채팅을 열 수 있고(§2.4 이전 경로), 저장이 꺼져 있던 때
    가입한 사람은 판정이 없다. **없는 것이 정상 경로다** — 그때는 블록을 통째로
    빼고, 모델은 지금까지와 같은 조건에서 답한다.
    """
    if state is None or not state.verdicts:
        return ""

    lines: list[str] = []

    if pinned is not None:
        here = next((v for v in state.verdicts if v.route_id == pinned), None)
        if here is not None:
            phrase = _STATE_PHRASE.get(here.state, _STATE_PHRASE[NodeState.UNKNOWN])
            lines.append(
                f"[이분의 상황] '{label_for(pinned)}' — {phrase}. "
                "이미 갖추신 것을 다시 하라고 말하지 마세요."
            )

    done = [v.route_id for v in state.verdicts if v.route_id.value in state.completed]
    if done:
        lines.append(f"[이미 마치신 일] {_ordered_labels(done)}")

    left = [v.route_id for v in state.verdicts if v.route_id.value not in state.completed]
    if left:
        lines.append(f"[아직 남은 일] {_ordered_labels(left)}")

    return "\n".join(lines)
