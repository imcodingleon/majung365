"""AI가 제안하는 다음 질문 — 기획서 §6.1.

답변을 다 읽은 사용자가 이어서 무엇을 물어야 할지 다시 막힌다. 대화가 시작되면
첫 질문 칩이 사라지기 때문이다.

여기서 지키려는 것은 셋이다. **순서**(답변이 다 흐른 뒤여야 그 답을 보고 물을 것이
정해진다), **모양**(질문이 질문으로 끝나야 하고 셋을 못 채우면 안 나간다), 그리고
**실패해도 답변이 남는가**.
"""

from app.domains.chat.application.dto import (
    ChatCommand,
    DoneEvent,
    SuggestionsEvent,
    TextEvent,
)
from app.domains.chat.application.usecase import ChatUseCase
from app.domains.chat.domain.suggestions import (
    MAX_QUESTION_CHARS,
    normalize_suggestions,
)
from app.domains.chat.domain.triage import QuestionType, RoutePriority, TriageResult
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository
from app.domains.shared.routes import RouteId
from tests.fakes import FakeLlm

TRIAGE = TriageResult(
    question_type=QuestionType.SUPPORT,
    priorities=(RoutePriority(route=RouteId.R9),),
)


async def _run(llm: FakeLlm, message: str = "신분증을 잃어버렸어요") -> list[object]:
    use = ChatUseCase(llm, JsonInstitutionRepository())
    return [ev async for ev in use.run(ChatCommand(message=message))]


# ── 정규화 (순수 함수) ──


def test_질문으로_끝나지_않으면_버린다() -> None:
    """**답이 들어 있는 문장이 질문 자리에 오면 안 된다.** 서술문은 사실을 담고
    있을 가능성이 높고, 사용자는 그것을 확인된 안내로 읽는다."""
    raw = ["언제쯤 나와요?", "긴급지원은 3일 안에 나와요.", "돈이 드나요?", "어디로 가요?"]
    assert normalize_suggestions(raw) == ("언제쯤 나와요?", "돈이 드나요?", "어디로 가요?")


def test_같은_질문은_한_번만_낸다() -> None:
    raw = ["돈이 드나요?", "돈이 드나요?", "어디로 가요?", "얼마나 걸려요?"]
    assert normalize_suggestions(raw) == ("돈이 드나요?", "어디로 가요?", "얼마나 걸려요?")


def test_긴_질문은_버린다() -> None:
    """칩 하나가 한 줄을 넘기면 가로 스크롤에서 읽히지 않는다."""
    long = "가" * (MAX_QUESTION_CHARS + 1) + "?"
    assert normalize_suggestions([long, "돈이 드나요?", "어디로 가요?"]) == ()


def test_셋을_못_채우면_아무것도_안_낸다() -> None:
    """**하나나 둘만 내면 칩 줄이 어중간하게 빈다.** 사용자는 나머지가 아직
    오는 중인지 없는 것인지 알 수 없다."""
    assert normalize_suggestions(["돈이 드나요?", "어디로 가요?"]) == ()
    assert normalize_suggestions([]) == ()


def test_넷_이상_와도_셋만_낸다() -> None:
    raw = ["가요?", "나요?", "다요?", "라요?"]
    assert normalize_suggestions(raw) == ("가요?", "나요?", "다요?")


# ── 스트림 안에서 ──


async def test_제안은_done_바로_앞에_온다() -> None:
    """**답변 본문이 다 흐른 뒤라야 그 답을 보고 이어서 물을 것이 정해진다.**
    카드보다도 뒤다 — 카드까지 본 다음에 물을 것이 남는다."""
    events = await _run(FakeLlm(TRIAGE))
    kinds = [type(e).__name__ for e in events]
    assert kinds[-1] == "DoneEvent"
    assert kinds[-2] == "SuggestionsEvent"


async def test_제안이_셋이다() -> None:
    events = await _run(FakeLlm(TRIAGE))
    suggested = next(e for e in events if isinstance(e, SuggestionsEvent))
    assert len(suggested.questions) == 3


async def test_셋을_못_채우면_이벤트가_아예_없다() -> None:
    """**빈 목록을 보내지 않는다.** 화면이 "아직 안 왔다"와 "없다"를 가리지 못한다.

    거르는 자리가 유스케이스라서 이것이 잡힌다 — 어댑터에서 걸렀다면 가짜가
    이미 거른 값을 주게 되어 이 규칙이 검증되지 않는다.
    """
    llm = FakeLlm(TRIAGE, suggestions=("돈이 드나요?", "어디로 가요?"))
    events = await _run(llm)
    assert not any(isinstance(e, SuggestionsEvent) for e in events)
    assert isinstance(events[-1], DoneEvent)


async def test_제안이_실패해도_답변이_남는다() -> None:
    """**본문과 카드는 이미 나갔다.** 여기서 예외가 올라가 스트림이 끊기면
    사용자는 다 읽은 답이 사라지는 것을 본다."""
    llm = FakeLlm(TRIAGE, raise_suggest=True)
    events = await _run(llm)
    assert any(isinstance(e, TextEvent) for e in events)
    assert isinstance(events[-1], DoneEvent)
    assert not any(isinstance(e, SuggestionsEvent) for e in events)


async def test_방금_한_답변을_보고_정한다() -> None:
    """**마지막 턴이 그 답변이어야 한다.** 사용자의 질문만 보고 정하면 답을
    받기 전과 같은 것을 다시 묻게 한다."""
    llm = FakeLlm(TRIAGE, text="행정복지센터에서 재발급받으실 수 있어요.")
    await _run(llm)
    assert llm.last_suggest_history is not None
    last = llm.last_suggest_history[-1]
    assert last.role == "assistant"
    assert "행정복지센터" in last.content


async def test_이름이_마스킹_경로로_흘러간다() -> None:
    """**`assert_masked`는 이름을 패턴으로 잡지 못한다.** 이 배선이 이름에 대한
    유일한 방어선이라, 새 호출 경로가 생길 때마다 따로 확인해야 한다."""
    llm = FakeLlm(TRIAGE)
    use = ChatUseCase(llm, JsonInstitutionRepository())
    async for _ in use.run(ChatCommand(message="안녕하세요", user_name="김판수")):
        pass
    assert llm.last_suggest_name == "김판수"


async def test_답이_비면_묻지_않는다() -> None:
    """**호출 한 번을 아낀다.** 답이 없으면 이어서 물을 것도 정할 수 없다."""
    llm = FakeLlm(TRIAGE, text="")
    await _run(llm)
    assert llm.last_suggest_history is None
