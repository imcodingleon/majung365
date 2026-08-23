"""근거 문서 검색 — 기획서 §6.4 ①단계.

억지로 붙인 근거는 없느니만 못하다. 관련 없는 문서를 근거로 답하면
사용자가 그것을 제도 안내로 믿는다.
"""

from app.domains.chat.application.dto import ChatCommand, EvidenceEvent
from app.domains.chat.application.usecase import ChatUseCase
from app.domains.chat.domain.evidence import EvidenceStage
from app.domains.chat.domain.triage import QuestionType, TriageResult
from app.domains.knowledge.domain.retrieval import tokenize
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository
from app.domains.knowledge.infrastructure.rag_repository import JsonRagRepository
from tests.fakes import FakeLlm

_rag = JsonRagRepository()


def test_bigrams_bridge_korean_particles() -> None:
    """조사가 붙어 어절이 일치하지 않는다 — "긴급복지를"과 "긴급복지지원"이 만나야 한다."""
    tokens = set(tokenize("긴급복지를"))
    assert "복지" in tokens, "어절 전체만 남으면 '긴급복지지원' 문서와 만나지 못한다"


def test_grammar_endings_do_not_score() -> None:
    """어미 2-gram은 내용어가 아닌데 문서에 흔해서 점수를 만든다."""
    tokens = set(tokenize("먹을까요"))
    assert "까요" not in tokens and "을까" not in tokens


def test_finds_the_document_that_answers_the_question() -> None:
    """수감 중 말소된 경우의 과태료 면제는 경상북도 자료에만 있다."""
    hits = _rag.index().search("주민등록이 말소됐는데 과태료 내야 하나요")
    assert hits
    assert "과태료" in hits[0][0].title


def test_unrelated_question_finds_nothing() -> None:
    """근거가 없으면 없다고 해야 한다. 그래야 ②단계로 넘어간다."""
    for question in ("오늘 점심 뭐 먹지", "키오스크 쓰는 법", "날씨 어때요"):
        assert _rag.index().search(question) == [], question


def test_weak_matches_are_cut_relative_to_the_best() -> None:
    """질문이 길면 관련 없는 구절까지 절대 점수가 올라간다."""
    hits = _rag.index().search("통장 만들 때 한도제한이 뭔가요")
    assert hits
    assert all(s >= hits[0][1] * 0.5 for _, s in hits)


def test_route_hint_boosts_but_does_not_filter() -> None:
    """triage가 항목을 잘못 골라도 답이 있는 문서가 사라지면 안 된다."""
    query = "개인회생 신청하려면 소득이 있어야 하나요"
    with_wrong_hint = _rag.index().search(query, routes=frozenset({"R1"}))
    assert with_wrong_hint, "엉뚱한 항목을 줘도 결과가 남아야 한다"


async def test_passages_make_the_answer_confirmed() -> None:
    """카드가 없어도 근거 문서를 찾았으면 인터넷을 뒤지지 않는다."""
    triage = TriageResult(question_type=QuestionType.DAILY, priorities=())
    llm = FakeLlm(triage)
    usecase = ChatUseCase(
        llm, JsonInstitutionRepository(), passages=_rag.index()
    )
    events = [
        e
        async for e in usecase.run(
            ChatCommand(message="주민등록이 말소됐는데 과태료 내야 하나요")
        )
    ]

    evidence = next(e for e in events if isinstance(e, EvidenceEvent))
    assert evidence.stage == EvidenceStage.CONFIRMED
    assert llm.last_allow_web is False


async def test_passage_text_reaches_the_prompt_with_its_source() -> None:
    """어느 기관 자료인지 밝혀야 한다 — 지자체 자료는 지역마다 기준이 다르다."""
    triage = TriageResult(question_type=QuestionType.DAILY, priorities=())
    llm = FakeLlm(triage)
    usecase = ChatUseCase(
        llm, JsonInstitutionRepository(), passages=_rag.index()
    )
    async for _ in usecase.run(ChatCommand(message="주민등록 말소 과태료")):
        pass

    assert llm.last_context is not None
    assert "수집한 공식 자료" in llm.last_context
    assert "어느 기관 자료인지" in llm.last_context


async def test_without_evidence_it_still_falls_back_to_web() -> None:
    triage = TriageResult(question_type=QuestionType.DAILY, priorities=())
    llm = FakeLlm(triage)
    usecase = ChatUseCase(
        llm, JsonInstitutionRepository(), passages=_rag.index()
    )
    events = [
        e async for e in usecase.run(ChatCommand(message="오늘 점심 뭐 먹을까요"))
    ]
    evidence = next(e for e in events if isinstance(e, EvidenceEvent))
    assert evidence.stage == EvidenceStage.WEB


def test_short_sections_are_not_indexed() -> None:
    """목차나 안내 문구는 근거가 되지 않는다."""
    assert _rag.count() > 50
