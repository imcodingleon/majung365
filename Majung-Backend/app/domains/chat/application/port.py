"""Chat이 의존하는 외부 포트 — LLM. 구현(Anthropic)은 adapter/outbound에."""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol

from app.domains.chat.application.dto import Turn
from app.domains.chat.domain.triage import TriageResult


@dataclass(frozen=True)
class GuidanceChunk:
    """답변 스트림의 한 조각.

    둘 중 하나다 — 사용자에게 보일 텍스트이거나, 검색이 시작됐다는 신호다.
    신호를 따로 두는 이유는 §6.4의 사전 고지가 **검색 결과보다 먼저** 나가야
    하기 때문이다. 나중에 "인터넷 정보였습니다"를 덧붙이면 이미 늦다.
    """

    text: str = ""
    web_search_started: bool = False


class ChatLlm(Protocol):
    """모델로 나가는 문. **`name`은 보낼 값이 아니라 지울 값이다.**

    구현이 그 이름을 `mask_text(name=...)`에 넘겨 대화에서 지운다. 로그인하지
    않은 사용자는 `None`이며, 그때는 정규식이 문맥으로 잡는 이름만 가려진다.
    """

    async def triage(
        self, message: str, history: list[Turn], *, name: str | None = None
    ) -> TriageResult:
        """상황을 6영역으로 분류하고 급한 순위를 정한다(구조화 출력)."""
        ...

    def stream_guidance(
        self,
        *,
        message: str,
        history: list[Turn],
        context: str,
        allow_web_search: bool,
        name: str | None = None,
    ) -> AsyncIterator[GuidanceChunk]:
        """쉬운 말 안내를 스트리밍으로 생성한다.

        **텍스트만이 아니라 '지금 검색을 시작했다'도 흘린다.** §6.4는 검색 전에
        먼저 알리라고 정하는데, 검색 여부는 모델이 답을 쓰는 도중에 정해진다.
        코드가 미리 판정하면 문서에 답이 있는지 모르는 채로 정하게 된다.
        """
        ...
