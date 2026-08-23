"""AI 답변의 근거 단계 — 기획서 §6.4.

확실성이 낮다는 신호가 정보보다 앞서야 한다. 나중에 "인터넷 정보였습니다"라고
덧붙이면 이미 사용자는 그것을 사실로 받아들인 뒤다.
"""

from app.domains.chat.application.dto import (
    CardEvent,
    ChatCommand,
    EvidenceEvent,
    TextEvent,
)
from app.domains.chat.application.usecase import ChatUseCase
from app.domains.chat.domain.evidence import WEB_SEARCH_NOTICE, EvidenceStage
from app.domains.chat.domain.triage import QuestionType, RoutePriority, TriageResult
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository
from app.domains.shared.routes import RouteId
from app.infrastructure.config.settings import Settings
from tests.fakes import FakeLlm


async def _run(triage: TriageResult, llm: FakeLlm | None = None) -> list[object]:
    use = ChatUseCase(llm or FakeLlm(triage), JsonInstitutionRepository())
    return [ev async for ev in use.run(ChatCommand(message="여쭤볼 게 있어요"))]


async def test_confirmed_stage_when_kb_matched() -> None:
    """확인된 자료에서 찾았으면 사전 고지가 없다."""
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(RoutePriority(route=RouteId.R9),),
    )
    events = await _run(triage)
    evidence = next(e for e in events if isinstance(e, EvidenceEvent))
    assert evidence.stage == EvidenceStage.CONFIRMED
    assert evidence.notice == ""


async def test_web_stage_announces_before_answering() -> None:
    """사전 고지가 답변 텍스트보다 먼저 나가야 한다.

    **나중에 "인터넷 정보였습니다"를 덧붙이면 이미 늦다**(§6.4). 확실성이 낮다는
    신호가 정보보다 앞서야 한다. 모델이 검색을 시작하는 순간에 내보내므로
    그 순서가 지켜진다.
    """
    triage = TriageResult(question_type=QuestionType.DAILY, priorities=())
    llm = FakeLlm(triage)
    llm.searches = True  # 모델이 자료로 부족하다고 판단해 검색한 경우
    events = await _run(triage, llm)

    kinds = [type(e).__name__ for e in events]
    assert kinds.index("EvidenceEvent") < kinds.index("TextEvent")

    evidence = next(e for e in events if isinstance(e, EvidenceEvent))
    assert evidence.stage == EvidenceStage.WEB
    assert evidence.notice == WEB_SEARCH_NOTICE


async def test_search_tool_is_always_offered() -> None:
    """**검색 도구는 근거가 있어도 준다.** 쓸지는 모델이 정한다(2026-08-24).

    옛 규칙은 "근거가 걸리면 도구를 주지 않는다"였는데, BM25는 단어가 겹치는
    문서를 찾을 뿐이라 답이 없어도 걸린다. 제도 이름이 든 질문은 반드시 뭔가
    걸리므로 **본 영역에서는 검색이 사실상 절대 안 됐다.**

    코드는 문서에 답이 들어 있는지 알 수 없다 — 읽어야 아는 것이다.
    """
    with_cards = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(RoutePriority(route=RouteId.R9),),
    )
    llm = FakeLlm(with_cards)
    await _run(with_cards, llm)
    assert llm.last_allow_web is True

    without = TriageResult(question_type=QuestionType.DAILY, priorities=())
    llm2 = FakeLlm(without)
    await _run(without, llm2)
    assert llm2.last_allow_web is True


async def test_badge_follows_what_actually_happened() -> None:
    """**배지는 추측이 아니라 사실이다.**

    검색하지 않고 답했으면 근거가 있을 때만 confirmed를 붙인다. 근거도 없고
    검색도 안 했으면 아무 배지도 붙이지 않는다 — 없는 근거를 "확인한 자료"라고
    말하는 것이 가장 나쁘다.
    """
    daily = TriageResult(question_type=QuestionType.DAILY, priorities=())

    searched = FakeLlm(daily)
    searched.searches = True
    events = await _run(daily, searched)
    evidence = next(e for e in events if isinstance(e, EvidenceEvent))
    assert evidence.stage == EvidenceStage.WEB

    quiet = FakeLlm(daily)  # 검색도 안 하고 근거도 없다
    events = await _run(daily, quiet)
    assert not [e for e in events if isinstance(e, EvidenceEvent)]


async def test_web_context_tells_the_model_to_signal_uncertainty() -> None:
    """말투가 갈려야 한다 — 같은 어조로 말하면 검색 결과를 제도 안내로 믿는다."""
    triage = TriageResult(question_type=QuestionType.DAILY, priorities=())
    llm = FakeLlm(triage)
    await _run(triage, llm)
    assert llm.last_context is not None
    assert "인터넷" in llm.last_context and "확인이 필요" in llm.last_context


async def test_evidence_comes_after_triage_and_before_cards() -> None:
    """SSE 순서 계약: triage → evidence → text → card → done."""
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(RoutePriority(route=RouteId.R9),),
    )
    kinds = [type(e).__name__ for e in await _run(triage)]
    assert kinds.index("TriageEvent") < kinds.index("EvidenceEvent")
    assert kinds.index("EvidenceEvent") < kinds.index("CardEvent")
    assert CardEvent and TextEvent  # 사용 표시


def test_local_government_domains_excluded_from_search() -> None:
    """근거로는 쓰되 검색에서는 뺀다. 부산 사용자에게 송파구 기준이 나가면
    자기 지역 기준이 아니라는 것을 알 방법이 없다."""
    domains = Settings().web_search_domains_list
    assert "gb.go.kr" not in domains
    assert "songpa.go.kr" not in domains


def test_search_whitelist_covers_collected_domains() -> None:
    """RAG가 교정본부를 근거로 쓰는데 검색은 같은 사이트에 못 가면 안 된다."""
    domains = set(Settings().web_search_domains_list)
    for required in ("corrections.go.kr", "law.go.kr", "nhis.or.kr", "mois.go.kr"):
        assert required in domains, f"{required}가 검색 목록에 없다"
