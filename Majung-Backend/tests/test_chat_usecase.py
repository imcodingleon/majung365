"""ChatUseCase 오케스트레이션 — SSE 순서·카드 매칭·폴백·에러 (페이크 LLM)."""

from app.domains.chat.application.dto import (
    CardEvent,
    ChatCommand,
    DoneEvent,
    ErrorEvent,
    TextEvent,
    TriageEvent,
)
from app.domains.chat.application.usecase import ChatUseCase
from app.domains.chat.domain.triage import AreaPriority, QuestionType, TriageResult
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository
from app.domains.shared.areas import Area
from tests.fakes import FakeLlm


async def _collect(usecase: ChatUseCase, message: str) -> list[object]:
    return [ev async for ev in usecase.run(ChatCommand(message=message))]


def _repo() -> JsonInstitutionRepository:
    return JsonInstitutionRepository()


async def test_support_flow_order_and_cards() -> None:
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(
            AreaPriority(area=Area.IDENTITY, reason="통장·신분증부터 필요해요"),
            AreaPriority(area=Area.WELFARE, reason="당장 생계가 급해요"),
        ),
    )
    llm = FakeLlm(triage)
    events = await _collect(ChatUseCase(llm, _repo()), "5년 살고 나왔는데 통장도 없어요")

    # 순서: triage → text* → card* → done
    assert isinstance(events[0], TriageEvent)
    assert isinstance(events[-1], DoneEvent)
    kinds = [type(e).__name__ for e in events]
    first_card = kinds.index("CardEvent")
    last_text = max(i for i, k in enumerate(kinds) if k == "TextEvent")
    assert last_text < first_card  # 카드는 텍스트 뒤

    triage_ev = events[0]
    assert isinstance(triage_ev, TriageEvent)
    assert triage_ev.areas[0].key == "identity"
    assert triage_ev.areas[0].rank == 1

    cards = [e for e in events if isinstance(e, CardEvent)]
    assert cards, "support면 KB 카드가 매칭돼야 한다"
    # 카드는 KB(identity/welfare) 항목이어야 한다 (환각 아님)
    for c in cards:
        assert c.card.area_label in ("신분 재건", "긴급복지·생계")

    # support면 웹 검색 비활성
    assert llm.last_allow_web is False


async def test_daily_flow_no_cards_web_enabled() -> None:
    triage = TriageResult(question_type=QuestionType.DAILY, priorities=())
    llm = FakeLlm(triage)
    events = await _collect(ChatUseCase(llm, _repo()), "카톡이 뭐예요?")

    assert not [e for e in events if isinstance(e, CardEvent)]  # 카드 없음
    assert any(isinstance(e, TextEvent) for e in events)  # 그래도 답한다
    assert isinstance(events[-1], DoneEvent)
    assert llm.last_allow_web is True  # daily면 웹 검색 허용


async def test_triage_failure_yields_error() -> None:
    triage = TriageResult(question_type=QuestionType.DAILY, priorities=())
    llm = FakeLlm(triage, raise_triage=True)
    events = await _collect(ChatUseCase(llm, _repo()), "안녕하세요")
    assert len(events) == 1 and isinstance(events[0], ErrorEvent)


async def test_stream_failure_yields_error_after_triage() -> None:
    triage = TriageResult(question_type=QuestionType.DAILY, priorities=())
    llm = FakeLlm(triage, raise_stream=True)
    events = await _collect(ChatUseCase(llm, _repo()), "안녕하세요")
    assert isinstance(events[0], TriageEvent)
    assert isinstance(events[-1], ErrorEvent)


async def test_injected_context_has_kb_facts_not_hallucinated() -> None:
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(AreaPriority(area=Area.HOUSING, reason="잘 곳이 없어요"),),
    )
    llm = FakeLlm(triage)
    await _collect(ChatUseCase(llm, _repo()), "잘 곳이 없어요")
    # 주입 컨텍스트에 '확인된 정보'와 주거 KB 항목이 들어가야 한다
    assert llm.last_context is not None
    assert "확인된 정보" in llm.last_context
