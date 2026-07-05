"""Chat이 의존하는 외부 포트 — LLM. 구현(Anthropic)은 adapter/outbound에."""

from collections.abc import AsyncIterator
from typing import Protocol

from app.domains.chat.application.dto import Turn
from app.domains.chat.domain.triage import TriageResult


class ChatLlm(Protocol):
    async def triage(self, message: str, history: list[Turn]) -> TriageResult:
        """상황을 6영역으로 분류하고 급한 순위를 정한다(구조화 출력)."""
        ...

    def stream_guidance(
        self,
        *,
        message: str,
        history: list[Turn],
        context: str,
        allow_web_search: bool,
    ) -> AsyncIterator[str]:
        """쉬운 말 안내를 스트리밍으로 생성한다(텍스트 델타)."""
        ...
