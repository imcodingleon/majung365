"""탭에서 연 대화의 범위 격리와 개인화 블록.

**실제로 있었던 결함을 붙잡아 둔다.** 수용·출소증명서(R13) 대화에서 "긴급복지
주거지원"과 "주민등록증 재발급" 카드가 함께 나갔다. `_pin_route`가 순서만 바꾸고
`_match_cards`가 triage 전체를 돌았기 때문이다.
"""

from app.domains.chat.application.dto import CardEvent, ChatCommand
from app.domains.chat.application.usecase import ChatUseCase
from app.domains.chat.domain.triage import (
    QuestionType,
    RoutePriority,
    TriageResult,
)
from app.domains.chat.domain.user_context import build_user_context
from app.domains.knowledge.domain.graph_engine import NodeState
from app.domains.knowledge.domain.intake import IntakeVerdict
from app.domains.knowledge.domain.state import IntakeState
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository
from app.domains.shared.routes import RouteId, SectionId, label_for
from tests.fakes import FakeLlm

# R13 대화에 R4·R9가 곁들여 딸려 온 그 상황.
_SPILLOVER = TriageResult(
    question_type=QuestionType.SUPPORT,
    priorities=(
        RoutePriority(route=RouteId.R13),
        RoutePriority(route=RouteId.R4),
        RoutePriority(route=RouteId.R9),
    ),
)


async def _run(llm: FakeLlm, cmd: ChatCommand) -> list[object]:
    usecase = ChatUseCase(llm, JsonInstitutionRepository())
    return [ev async for ev in usecase.run(cmd)]


async def test_pinned_route_yields_only_that_card() -> None:
    llm = FakeLlm(_SPILLOVER)
    events = await _run(
        llm,
        ChatCommand(message="출소증명서 어디서 받아요?", route_id="R13"),
    )

    cards = [e.card for e in events if isinstance(e, CardEvent)]
    assert cards, "핀이 걸려도 그 항목 카드는 나와야 한다"
    assert all(c.route_label == label_for(RouteId.R13) for c in cards), (
        "다른 항목의 카드가 섞이면 안 된다 — 주거·신분증 카드가 끼어든 결함"
    )


async def test_unpinned_chat_still_gets_several_cards() -> None:
    """항목에 매이지 않은 일반 대화는 그대로 여러 장을 낸다."""
    llm = FakeLlm(_SPILLOVER)
    events = await _run(llm, ChatCommand(message="막막해요"))

    labels = {e.card.route_label for e in events if isinstance(e, CardEvent)}
    assert len(labels) > 1


async def test_other_routes_survive_in_prompt_as_names_only() -> None:
    """곁가지 이야기를 막지는 않는다. 카드만 막고 본문은 답한다."""
    llm = FakeLlm(_SPILLOVER)
    await _run(llm, ChatCommand(message="잘 곳도 없어요", route_id="R13"))

    context = llm.last_context or ""
    assert f"[지금 보고 있는 할 일] {label_for(RouteId.R13)}" in context
    assert "[함께 꺼내신 이야기]" in context
    assert label_for(RouteId.R4) in context


async def test_injection_has_no_labels() -> None:
    """카드 사실을 라벨로 넣으면 모델이 그 라벨을 베껴 쓴다."""
    llm = FakeLlm(_SPILLOVER)
    await _run(llm, ChatCommand(message="출소증명서요", route_id="R13"))

    context = llm.last_context or ""
    for label in ("어디서:", "서류:", "다음 단계:", "준비할 서류:"):
        assert label not in context, f"주입 문자열에 '{label}' 라벨이 남아 있다"


# ── 개인화 블록 ──

_VERDICTS = (
    IntakeVerdict(
        route_id=RouteId.R10,
        section_id=SectionId.S3,
        blocks_others=False,
        state=NodeState.BLOCKED,
        purpose="병원비",
    ),
    IntakeVerdict(
        route_id=RouteId.R9,
        section_id=SectionId.S3,
        blocks_others=True,
        state=NodeState.O,
    ),
)


def test_user_context_names_state_of_current_route() -> None:
    state = IntakeState(verdicts=_VERDICTS, completed=frozenset({"R9"}))
    block = build_user_context(state, RouteId.R10)

    assert "쓸 수 없는 상태" in block
    assert label_for(RouteId.R10) in block
    assert f"[이미 마치신 일] {label_for(RouteId.R9)}" in block


def test_user_context_omits_purpose_and_full_state_table() -> None:
    """**데이터 최소화.** 용도와 항목 전체의 보유 상태는 담지 않는다."""
    state = IntakeState(verdicts=_VERDICTS, completed=frozenset())
    block = build_user_context(state, RouteId.R10)

    assert "병원비" not in block
    # 상태 문구는 지금 보고 있는 항목 하나에만 붙는다.
    assert block.count("상태입니다") <= 1


def test_user_context_is_empty_without_verdicts() -> None:
    """가입 전에도 챗을 열 수 있다. 판정이 없는 것이 정상 경로다."""
    assert build_user_context(None, RouteId.R13) == ""
    assert build_user_context(IntakeState(verdicts=()), RouteId.R13) == ""


async def test_intake_reaches_the_prompt() -> None:
    llm = FakeLlm(_SPILLOVER)
    await _run(
        llm,
        ChatCommand(
            message="통장 만들어야 하나요?",
            route_id="R10",
            intake=IntakeState(verdicts=_VERDICTS, completed=frozenset({"R9"})),
        ),
    )

    context = llm.last_context or ""
    assert "[이분의 상황]" in context
    assert "병원비" not in context
