"""Mock LLM 어댑터 검증 — 실키 없이 demo-scenario 픽스처 + 프론트 시나리오 라우팅.

test_triage_integration.py는 실키가 있어야 돌지만, 이 테스트는 Mock으로 항상 돈다.
"""

import pytest

from app.domains.chat.adapter.outbound.external.mock_client import MockChatLlm
from app.domains.chat.domain.triage import QuestionType
from app.domains.shared.routes import RouteId

# demo-scenario.md 입력 3종 + 프론트 시나리오 5종 → 기대 지원 항목(상위에 포함되어야 함)
_FREE_INPUT = "5년 살고 나왔는데 통장도 없고 휴대폰도 안 돼요. 뭐부터 해야 할지 모르겠어요"
SUPPORT_CASES = [
    ("막 출소했어요", {RouteId.R13, RouteId.R9, RouteId.R2}),
    ("잘 곳이 없어요", {RouteId.R1, RouteId.R2}),
    (_FREE_INPUT, {RouteId.R10, RouteId.R9}),
    ("오늘 출소했는데 갈 곳도 없고 돈도 거의 없어요. 5만원밖에 없고 가족도 없어요.", {RouteId.R1, RouteId.R2}),  # noqa: E501
    ("폰이 안 열려요. 공동인증서가 어떻게 된 건지 모르겠고 주민등록증도 없어요.", {RouteId.R9}),
    ("전과가 있어도 취업할 수 있는 방법이 있을까요?", {RouteId.R6}),
    ("당장 생활비가 없는데 정부 지원을 받을 수 있나요?", {RouteId.R2}),
    ("나와도 아무것도 안 되는 것 같아서 다 포기하고 싶어요.", {RouteId.R8}),
]


@pytest.mark.parametrize("message,expected", SUPPORT_CASES)
async def test_mock_triage_expected_routes(message: str, expected: set[RouteId]) -> None:
    llm = MockChatLlm()
    result = await llm.triage(message, [])
    assert result.question_type == QuestionType.SUPPORT
    got = {p.route for p in result.priorities}
    assert expected & got, f"기대 항목 {expected} 중 하나도 triage에 없음: {got}"
    # 모든 우선순위에 쉬운 말 사유가 붙는다
    assert all(p.reason for p in result.priorities)


async def test_mock_triage_daily_fallback() -> None:
    """지원 항목이 안 잡히는 일반 질문 → DAILY(카드 없음)."""
    llm = MockChatLlm()
    result = await llm.triage("안녕하세요, 오늘 날씨 좋네요", [])
    assert result.question_type == QuestionType.DAILY
    assert result.priorities == ()


async def test_mock_stream_guidance_yields_text() -> None:
    """안내 스트리밍이 비지 않은 텍스트를 흘려보낸다."""
    llm = MockChatLlm()
    chunks = [
        c
        async for c in llm.stream_guidance(
            message="잘 곳이 없어요",
            history=[],
            context="",
            allow_web_search=False,
        )
    ]
    joined = "".join(chunks)
    assert joined.strip()
    assert len(chunks) >= 2  # 스트리밍 흉내 — 여러 청크


async def test_mock_stream_guidance_health_hotline() -> None:
    """마음이 급한 경우 안내 끝에 상담 전화번호가 포함된다."""
    llm = MockChatLlm()
    joined = "".join(
        [
            c
            async for c in llm.stream_guidance(
                message="다 포기하고 싶어요",
                history=[],
                context="",
                allow_web_search=False,
            )
        ]
    )
    assert "1577-0199" in joined
