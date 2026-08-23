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
from app.domains.chat.domain.triage import (
    REASON_TEXTS,
    QuestionType,
    ReasonCode,
    RoutePriority,
    TriageResult,
)
from app.domains.knowledge.domain.graph_engine import routes_blocking_others
from app.domains.knowledge.infrastructure.graph_repository import JsonGraphRepository
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository
from app.domains.shared.routes import RouteId
from tests.fakes import FakeLlm


async def _collect(usecase: ChatUseCase, message: str) -> list[object]:
    return [ev async for ev in usecase.run(ChatCommand(message=message))]


def _repo() -> JsonInstitutionRepository:
    return JsonInstitutionRepository()


async def test_support_flow_order_and_cards() -> None:
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(
            RoutePriority(route=RouteId.R9),
            RoutePriority(route=RouteId.R2),
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
    assert triage_ev.routes[0].key == "R9"
    assert triage_ev.routes[0].rank == 1

    cards = [e for e in events if isinstance(e, CardEvent)]
    assert cards, "support면 KB 카드가 매칭돼야 한다"
    # 카드는 triage가 고른 항목(R9 신분증 / R2 공단 긴급지원)의 KB 항목이어야 한다 (환각 아님)
    for c in cards:
        assert "신분증" in c.card.route_label or "공단 긴급지원" in c.card.route_label

    # support면 웹 검색 비활성
    # 검색 도구는 근거가 있어도 준다 — 쓸지는 모델이 정한다(2026-08-24).
    assert llm.last_allow_web is True


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
        priorities=(RoutePriority(route=RouteId.R1),),
    )
    llm = FakeLlm(triage)
    await _collect(ChatUseCase(llm, _repo()), "잘 곳이 없어요")
    # 주입 컨텍스트에 '확인된 정보'와 숙식 KB 항목이 들어가야 한다
    assert llm.last_context is not None
    assert "확인된 정보" in llm.last_context


# ── 사유는 모델이 아니라 서버가 데이터에서 도출한다 (기획서 §12-22) ──


def _blocking() -> frozenset[str]:
    return routes_blocking_others(JsonGraphRepository().nodes())


async def test_reason_comes_from_graph_not_from_model() -> None:
    """선행조건인 항목에는 사유가 붙는다. 모델은 이 문장에 관여하지 않는다."""
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(RoutePriority(route=RouteId.R9),),  # 신분증 — 여러 항목의 선행조건
    )
    events = await _collect(ChatUseCase(FakeLlm(triage), _repo(), _blocking()), "신분증이 없어요")

    banner = events[0]
    assert isinstance(banner, TriageEvent)
    assert banner.routes[0].reason == REASON_TEXTS[ReasonCode.BLOCKS_OTHERS]


async def test_reason_is_empty_when_screen_already_says_it() -> None:
    """사유의 기본값은 '없음'이다. 화면이 이미 말하는 것을 문장으로 되풀이하지 않는다."""
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(RoutePriority(route=RouteId.R12),),  # 생계급여 — 선행조건도 아니고 서류도 필요
    )
    events = await _collect(ChatUseCase(FakeLlm(triage), _repo(), _blocking()), "생활비가 없어요")

    banner = events[0]
    assert isinstance(banner, TriageEvent)
    assert banner.routes[0].reason == ""


async def test_no_documents_reason() -> None:
    """준비물이 없다는 사실은 카드에 드러나지 않는다 — '필요 서류'는 있을 때만 나온다."""
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(RoutePriority(route=RouteId.R8),),  # 심리상담 — 전화 한 통, 서류 없음
    )
    events = await _collect(ChatUseCase(FakeLlm(triage), _repo(), _blocking()), "많이 힘들어요")

    banner = events[0]
    assert isinstance(banner, TriageEvent)
    assert banner.routes[0].reason == REASON_TEXTS[ReasonCode.NO_DOCUMENTS]


async def test_reason_text_never_carries_user_input() -> None:
    """사유는 고정 문구 집합에서만 나온다 — 사용자가 말한 죄목이 실릴 자리가 없다."""
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=tuple(RoutePriority(route=r) for r in (RouteId.R9, RouteId.R8, RouteId.R12)),
    )
    events = await _collect(
        ChatUseCase(FakeLlm(triage), _repo(), _blocking()),
        "사기로 3년 살고 나왔는데 통장이 없어요",
    )

    banner = events[0]
    assert isinstance(banner, TriageEvent)
    allowed = set(REASON_TEXTS.values()) | {""}
    for route in banner.routes:
        assert route.reason in allowed, f"고정 문구가 아닌 사유가 나왔다: {route.reason}"


# ── R2 병렬 안내 (기획서 §12-15) ──


async def test_r2_offers_both_paths_in_one_card() -> None:
    """R2는 신청할 곳이 둘이다. 다만 할 일은 하나이므로 카드를 나누지 않고 옵션으로 묶는다 —
    카드 개수와 할 일 개수가 어긋나면 "몇 개 중 몇 개 완료"를 셀 수 없다."""
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(RoutePriority(route=RouteId.R2),),
    )
    events = await _collect(ChatUseCase(FakeLlm(triage), _repo(), _blocking()), "생활비가 없어요")
    cards = [e.card for e in events if isinstance(e, CardEvent)]

    assert len(cards) == 1, "할 일 하나에 카드 하나"
    orgs = [o.org for o in cards[0].options]
    assert len(orgs) == 2 and "법무보호복지공단 긴급지원" in orgs[0]


async def test_single_path_route_still_has_one_option() -> None:
    """옵션은 항상 최소 하나다 — 화면이 길이로 분기하지 않아도 된다."""
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(RoutePriority(route=RouteId.R8),),
    )
    events = await _collect(ChatUseCase(FakeLlm(triage), _repo(), _blocking()), "많이 힘들어요")
    card = [e.card for e in events if isinstance(e, CardEvent)][0]
    assert len(card.options) == 1
    assert card.options[0].where == card.where


async def test_card_label_names_the_route_it_came_from() -> None:
    """정부 긴급복지는 R2·R12 양쪽 근거라, 걸친 항목을 모두 이어붙이면 왜 떴는지 알 수 없다."""
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(RoutePriority(route=RouteId.R2),),
    )
    events = await _collect(ChatUseCase(FakeLlm(triage), _repo(), _blocking()), "생활비가 없어요")
    cards = [e.card for e in events if isinstance(e, CardEvent)]

    for card in cards:
        assert card.route_label == "공단 긴급지원"


async def test_routes_without_companions_stay_single() -> None:
    """동반은 예외다. 대부분의 항목은 대표 한 장으로 끝난다."""
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(RoutePriority(route=RouteId.R8),),
    )
    events = await _collect(ChatUseCase(FakeLlm(triage), _repo(), _blocking()), "많이 힘들어요")
    assert len([e for e in events if isinstance(e, CardEvent)]) == 1


# ── 카드에서 연 대화는 그 항목을 앞에 세운다 (기획서 §6.1) ──


async def test_card_route_comes_first() -> None:
    """**카드가 대표 경로만 안내하고 세부는 챗봇이 맡기로 했다.**

    그러려면 챗봇이 어느 카드에서 열렸는지 알아야 한다. R14 카드를 보다가
    "다음에 뭘 해야 하나요"라고 물으면 그 문장만으로는 무슨 얘기인지 알 수 없다.
    """
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(RoutePriority(route=RouteId.R9),),
    )
    usecase = ChatUseCase(FakeLlm(triage), JsonInstitutionRepository())
    events = [
        e
        async for e in usecase.run(
            ChatCommand(message="다음에 뭘 해야 하나요", route_id="R14")
        )
    ]
    routes = next(e for e in events if isinstance(e, TriageEvent)).routes
    assert routes[0].key == "R14"
    # **모델이 고른 것을 지우지 않는다.** 카드에서 열었어도 다른 것을 물을 수 있다.
    assert "R9" in [r.key for r in routes]


async def test_unknown_route_id_is_ignored() -> None:
    """틀린 값으로 검색 범위를 좁히면 맞는 근거까지 걸러진다."""
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(RoutePriority(route=RouteId.R9),),
    )
    usecase = ChatUseCase(FakeLlm(triage), JsonInstitutionRepository())
    events = [
        e
        async for e in usecase.run(
            ChatCommand(message="신분증 어디서 만드나요", route_id="R99")
        )
    ]
    routes = next(e for e in events if isinstance(e, TriageEvent)).routes
    assert routes[0].key == "R9"
