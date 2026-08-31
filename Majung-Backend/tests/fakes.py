"""테스트용 페이크 — 실제 Claude 호출 없이 UseCase 오케스트레이션 검증."""

from collections.abc import AsyncIterator

from app.domains.chat.application.dto import Turn
from app.domains.chat.application.port import GuidanceChunk
from app.domains.chat.domain.triage import TriageResult


class FakeLlm:
    def __init__(
        self,
        triage_result: TriageResult,
        *,
        raise_triage: bool = False,
        raise_stream: bool = False,
        raise_suggest: bool = False,
        text: str = "이렇게 해보세요.",
        suggestions: tuple[str, ...] = (
            "어디로 가면 돼요?",
            "무슨 서류가 필요해요?",
            "돈이 드나요?",
        ),
    ) -> None:
        self._triage = triage_result
        self._raise_triage = raise_triage
        self._raise_stream = raise_stream
        self._raise_suggest = raise_suggest
        self._text = text
        # 모델이 낸 것 그대로. **여기서 거르지 않는다** — 개수와 모양 판정은
        # 유스케이스가 맡으므로, 가짜가 대신 지키면 그 규칙이 검증되지 않는다.
        self._suggestions = suggestions
        # 이 가짜가 웹 검색을 흉내낼 것인가. 배지는 검색 여부로 정해진다.
        self.searches = False
        self.last_allow_web: bool | None = None
        self.last_context: str | None = None
        # 마스킹에 쓸 이름이 실제로 흘러왔는지 센다.
        # **`assert_masked`가 이름은 못 잡으므로 배선 자체가 유일한 방어선이다.**
        self.last_triage_name: str | None = None
        self.last_stream_name: str | None = None
        self.last_suggest_name: str | None = None
        # 제안을 뽑을 때 넘어온 대화. 마지막이 방금 한 답변이어야 한다.
        self.last_suggest_history: list[Turn] | None = None

    async def triage(
        self, message: str, history: list[Turn], *, name: str | None = None
    ) -> TriageResult:
        self.last_triage_name = name
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
        name: str | None = None,
    ) -> AsyncIterator[GuidanceChunk]:
        self.last_stream_name = name
        self.last_allow_web = allow_web_search
        self.last_context = context
        if self._raise_stream:
            raise RuntimeError("stream down")
        # **검색을 흉내낼 수 있어야 배지 판정을 시험할 수 있다.** 실제 모델은
        # 답을 쓰기 전에 검색을 시작하므로 순서도 그대로 맞춘다.
        if self.searches:
            yield GuidanceChunk(web_search_started=True)
        for word in self._text.split():
            yield GuidanceChunk(text=word + " ")

    async def suggest_questions(
        self, history: list[Turn], *, context: str = "", name: str | None = None
    ) -> tuple[str, ...]:
        self.last_suggest_name = name
        self.last_suggest_history = list(history)
        if self._raise_suggest:
            raise RuntimeError("suggest down")
        return self._suggestions
