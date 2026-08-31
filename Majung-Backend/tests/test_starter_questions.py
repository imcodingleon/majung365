"""할 일별 첫 질문 (§6.1).

**빈 입력창은 저리터러시 사용자에게 가장 어려운 화면이다.** 무엇을 물어야 할지
몰라서 멈추는 사람에게 눌러서 보낼 문장을 내주는 것이 이 표다.

여기서 지키려는 것은 넷이다. **항목이 빠지지 않는가**, **개수가 부담스럽지
않은가**, **질문이 질문으로 끝나는가**, 그리고 **화면 규칙을 어기지 않는가**.
"""

import pytest

from app.domains.shared.routes import RouteId
from app.domains.shared.starter_questions import STARTER_QUESTIONS, questions_for

# 칩 하나가 한 줄을 넘기면 가로 스크롤에서 읽히지 않는다.
MAX_CHARS = 15
# 다섯을 넘으면 고르는 일 자체가 부담이 된다(인수인계 문서 §3).
MIN_COUNT, MAX_COUNT = 3, 4


def test_모든_항목에_첫_질문이_있다() -> None:
    """**하나라도 빠지면 그 대화방만 기본 문구로 돌아간다.** 오류가 나지 않아
    아무도 모른 채 남는다 — 실제로 목업 네 개가 모든 방에 뜨던 것이 그 모양이었다."""
    assert set(STARTER_QUESTIONS) == set(RouteId)


def test_R5는_결번이다() -> None:
    """번호를 다시 매기지 않는다. 기획서의 모든 참조가 어긋난다."""
    assert not any(r.value == "R5" for r in STARTER_QUESTIONS)


def test_항목당_세넷_개다() -> None:
    over = {
        r.value: len(qs)
        for r, qs in STARTER_QUESTIONS.items()
        if not MIN_COUNT <= len(qs) <= MAX_COUNT
    }
    assert not over, f"개수가 어긋난 항목: {over}"


def test_질문으로_끝난다() -> None:
    """**AI가 만든 것이든 우리가 쓴 것이든 질문 자리에는 질문만 둔다.**
    사실을 담은 문장을 넣으면 사용자가 그것을 확인된 안내로 읽는다."""
    bad = [q for qs in STARTER_QUESTIONS.values() for q in qs if not q.endswith("?")]
    assert not bad, f"물음표로 끝나지 않는다: {bad}"


def test_한_줄에_들어간다() -> None:
    long = [
        q for qs in STARTER_QUESTIONS.values() for q in qs if len(q) > MAX_CHARS
    ]
    assert not long, f"{MAX_CHARS}자를 넘는다: {long}"


def test_화면에_쓰지_않는_말이_없다() -> None:
    """"죄목"은 그 말이 화면에 뜨는 것 자체가 낙인이다. "영역"은 폐기한 6영역
    분류와 혼동된다. **"수용 사유"는 쓴다** (2026-08-31 결정)."""
    joined = " ".join(q for qs in STARTER_QUESTIONS.values() for q in qs)
    assert "죄목" not in joined
    assert "영역" not in joined


def test_어체가_해요체다() -> None:
    """이 자리는 **사용자가 하는 말**이다(`copy-voice.md` §5). 합니다체로 쓰면
    사용자의 말이 아니라 서류의 말이 된다."""
    bad = [
        q
        for qs in STARTER_QUESTIONS.values()
        for q in qs
        if q.endswith(("습니까?", "입니까?", "니까?"))
    ]
    assert not bad, f"합니다체로 쓰였다: {bad}"


def test_표에서_빠진_항목은_빈_값이다(monkeypatch: pytest.MonkeyPatch) -> None:
    """**예외를 던지지 않는다.** 항목이 새로 생겨 표에 아직 없을 때, 문구가
    없다고 대화가 안 열리면 안 된다. `label_for`가 KeyError를 내는 것과 갈린다."""
    monkeypatch.delitem(STARTER_QUESTIONS, RouteId.R1)
    assert questions_for(RouteId.R1) == ()
    # 나머지 항목은 그대로다 — 하나가 빠져도 다른 방이 함께 죽지 않는다.
    assert questions_for(RouteId.R9)
