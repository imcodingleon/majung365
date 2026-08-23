"""실연동 triage 검증 (demo-scenario 입력 3종 → 기대 지원 항목).

ANTHROPIC_API_KEY가 없으면 skip. 키 도착 후 이 테스트로 AC를 확인한다.
"""

import os

import pytest

from app.domains.chat.adapter.outbound.external.claude_client import ClaudeChatLlm
from app.domains.chat.domain.triage import QuestionType
from app.domains.shared.routes import RouteId
from app.infrastructure.config.settings import Settings

pytestmark = pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY"),
    reason="실연동 테스트 — ANTHROPIC_API_KEY 필요",
)

# demo-scenario.md 입력 3종 → 기대 항목(상위에 하나라도 포함되어야 함).
# 각 집합은 같은 상황을 가리키는 이웃 항목들이라 정확히 어느 하나로 좁히지 않는다.
_FREE_INPUT = "5년 살고 나왔는데 통장도 없고 휴대폰도 안 돼요. 뭐부터 해야 할지 모르겠어요"
CASES = [
    ("막 출소했어요", {RouteId.R13, RouteId.R9, RouteId.R2}),
    ("잘 곳이 없어요", {RouteId.R1, RouteId.R4, RouteId.R2}),
    (_FREE_INPUT, {RouteId.R9, RouteId.R10}),
]


@pytest.mark.parametrize("message,expected", CASES)
async def test_triage_expected_routes(message: str, expected: set[RouteId]) -> None:
    llm = ClaudeChatLlm(Settings())
    result = await llm.triage(message, [])
    assert result.question_type == QuestionType.SUPPORT
    got = {p.route for p in result.priorities}
    assert expected & got, f"기대 항목 {expected} 중 하나도 triage에 없음: {got}"
