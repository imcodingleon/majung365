"""핀이 걸린 대화가 다른 항목으로 새는 것 (2026-08-31 실사용 결함).

R13(수용·출소증명서) 방에서 "잃어버렸는데 어떡해요?"를 눌렀더니 답변이 신분증(R9)
재발급 안내로 시작했고, 정작 그 방의 주제는 두 번째 문단에 가서야 나왔다.

**모델이 지시를 어긴 것이 아니었다.** 프롬프트에서 곁가지 자료가 주제 자료보다
위에 있었고, 주제 자료는 카드 한 줄 요약뿐인데 곁가지는 본문이었다. 순서를 따르면
그렇게 답하는 것이 자연스럽다.

여기서 지키려는 것은 하나다. **지금 보고 있는 할 일의 자료가 곁가지보다 먼저 읽힌다.**
"""

from app.domains.chat.application.dto import ChatCommand
from app.domains.chat.application.usecase import ChatUseCase
from app.domains.chat.domain.triage import QuestionType, RoutePriority, TriageResult
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository
from app.domains.knowledge.infrastructure.rag_repository import JsonRagRepository
from app.domains.shared.routes import RouteId
from tests.fakes import FakeLlm

# 실제로 났던 상황 — 짧은 질문이라 triage가 방과 다른 항목을 골랐다.
LEAKY_TRIAGE = TriageResult(
    question_type=QuestionType.SUPPORT,
    priorities=(RoutePriority(route=RouteId.R9),),
)


def _usecase(llm: FakeLlm) -> ChatUseCase:
    insts = JsonInstitutionRepository()
    return ChatUseCase(llm, insts, passages=JsonRagRepository(cards=insts.all()).index())


async def _context_for(message: str, route_id: str) -> str:
    llm = FakeLlm(LEAKY_TRIAGE)
    async for _ in _usecase(llm).run(ChatCommand(message=message, route_id=route_id)):
        pass
    assert llm.last_context is not None
    return llm.last_context


async def test_주제_자료가_곁가지보다_먼저_읽힌다() -> None:
    """**이것이 이 결함의 핵심이다.** 모델은 위에서부터 읽고, 먼저 읽은 것으로
    답을 시작한다. 곁가지가 위에 있으면 그 항목 안내가 첫 문단이 된다."""
    context = await _context_for("잃어버렸는데 어떡해요?", "R13")
    topic = context.index("[확인된 정보")
    aside = context.index("[다른 할 일에 관한 자료")
    assert topic < aside, "곁가지 자료가 주제 자료보다 위에 있다 — 답이 그쪽으로 샌다"


async def test_주제가_무엇인지_먼저_말한다() -> None:
    """맨 위에 지금 보고 있는 할 일이 있어야 한다."""
    context = await _context_for("잃어버렸는데 어떡해요?", "R13")
    assert context.startswith("[지금 보고 있는 할 일] 수용·출소증명서")


async def test_곁가지_자료도_버리지_않는다() -> None:
    """**순서만 바꾸고 내용은 그대로 둔다.** 그 항목에 근거가 없다고 답할 수 있는
    문서까지 사라지면, "잘 곳도 없어요"를 꺼낸 사람을 돌려보내는 셈이 된다."""
    context = await _context_for("잃어버렸는데 어떡해요?", "R13")
    assert "[다른 할 일에 관한 자료" in context
    assert "주민등록증 재발급" in context


async def test_triage에_지금_보고_있는_할_일을_알려준다() -> None:
    """**화면은 어느 방인지 아는데 모델에게 알려주지 않았다.**

    "잃어버렸는데 어떡해요?"에는 무엇을 잃어버렸는지가 없다. 방이 R13인 줄 모르는
    모델은 그 말만 보고 신분증(R9)을 떠올리고, 그 R9가 곁가지 자료와 "함께 꺼내신
    이야기"의 출처가 된다. `_pin_route`는 순서만 바꾸므로 R9는 그대로 남는다.

    저리터러시 사용자는 짧게 묻는다. 문구를 길게 만들어 해결할 일이 아니라,
    아는 것을 알려주지 않던 자리를 메우는 일이다.
    """
    llm = FakeLlm(LEAKY_TRIAGE)
    async for _ in _usecase(llm).run(
        ChatCommand(message="잃어버렸는데 어떡해요?", route_id="R13")
    ):
        pass
    assert llm.last_triage_route == "수용·출소증명서"


async def test_항목에_매이지_않은_대화는_방을_알리지_않는다() -> None:
    """일반 대화는 방이 없다. 없는 것을 지어내 알리지 않는다."""
    llm = FakeLlm(LEAKY_TRIAGE)
    async for _ in _usecase(llm).run(ChatCommand(message="안녕하세요")):
        pass
    assert llm.last_triage_route == ""
