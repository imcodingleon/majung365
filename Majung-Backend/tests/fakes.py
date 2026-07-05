"""테스트용 페이크 — 실제 Claude 호출 없이 UseCase 오케스트레이션 검증."""

from collections.abc import AsyncIterator

from app.domains.chat.application.dto import Turn
from app.domains.chat.domain.triage import TriageResult


class FakeLlm:
    def __init__(
        self,
        triage_result: TriageResult,
        *,
        raise_triage: bool = False,
        raise_stream: bool = False,
        text: str = "이렇게 해보세요.",
    ) -> None:
        self._triage = triage_result
        self._raise_triage = raise_triage
        self._raise_stream = raise_stream
        self._text = text
        self.last_allow_web: bool | None = None
        self.last_context: str | None = None

    async def triage(self, message: str, history: list[Turn]) -> TriageResult:
        if self._raise_triage:
            raise RuntimeError("upstream down")
        return self._triage

    async def stream_guidance(
        self,
        *,
        message: str,
        history: list[Turn],
        context: str,
        allow_web_search: bool,
    ) -> AsyncIterator[str]:
        self.last_allow_web = allow_web_search
        self.last_context = context
        if self._raise_stream:
            raise RuntimeError("stream down")
        for word in self._text.split():
            yield word + " "
