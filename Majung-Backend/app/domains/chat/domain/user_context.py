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

`IntakeState`는 애초에 답변 원문을 담지 않도록 설계되어 있다(`knowledge/domain/
state.py` 머리말).

**수용 사유는 2026-09-02에 들어왔다.** 기획서 §9.4가 정한 예외이며, 무엇을 안내할지
고르는 데만 쓴다. 그 전제는 **식별정보 마스킹이 확실하게 동작하는 것**이다 — 이름과
생년월일과 날짜를 지우고 나면 대분류만으로는 개인을 특정할 수 없다. 위험한 것은
수용 사유 자체가 아니라 수용 사유와 신원의 결합이다.

프로필 블록을 따로 만드는 이유는 검증 때문이다. 안내 컨텍스트 전체에 `assert_masked`를
걸면 서버가 붙인 기관 유선번호에 걸려 정상 안내가 통째로 막힌다. **프로필 블록만**
검사한다.
"""

from app.domains.knowledge.domain.graph_engine import NodeState
from app.domains.knowledge.domain.state import IntakeState
from app.domains.shared.profile import MaskedProfile, profile_line
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


def build_profile_block(profile: MaskedProfile | None) -> str:
    """모델에게 이분이 어떤 분인지 알리는 블록. **없으면 빈 문자열이다.**

    **답변에 수용 사유를 언급하지 말라고 못 박는다.** 카드에 수용 사유를 내기로 한
    2026-09-02 결정은 *서버가 조립한 검수된 문장*에 대한 것이고, 모델이 즉석에서
    쓰는 문장은 검수를 거치지 않아 없는 제약을 지어낼 수 있다. 모델은 사유를 알고
    **무엇을 말할지 고르되** 왜 그런지는 말하지 않는다.

    에두른 말까지 막는 이유는 그것도 노출이기 때문이다. "그 일 때문에"는 옆에서
    보는 사람에게 수용 사유가 있다는 사실을 그대로 알린다.
    """
    line = profile_line(profile)
    if not line:
        return ""
    return (
        f"[이분에 대해 알아 둘 것] {line}\n"
        "이 정보는 무엇을 안내할지 고르는 데만 씁니다. "
        "**답변 문장에 수용 사유를 언급하지 마세요.** "
        "'그 일 때문에'·'예전 사건이 있어서' 같은 에두른 말도 쓰지 않습니다."
    )


def build_user_context(
    state: IntakeState | None,
    pinned: RouteId | None,
    profile_block: str = "",
) -> str:
    """진단 판정을 프롬프트에 붙일 블록으로. 판정이 없으면 빈 문자열이다.

    가입하지 않고도 채팅을 열 수 있고(§2.4 이전 경로), 저장이 꺼져 있던 때
    가입한 사람은 판정이 없다. **없는 것이 정상 경로다** — 그때는 블록을 통째로
    빼고, 모델은 지금까지와 같은 조건에서 답한다.
    """
    if state is None or not state.verdicts:
        # 판정이 없어도 프로필은 있을 수 있다 — 가입은 했는데 저장이 꺼져 있던 경우다.
        return profile_block

    lines: list[str] = []
    if profile_block:
        lines.append(profile_block)

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
