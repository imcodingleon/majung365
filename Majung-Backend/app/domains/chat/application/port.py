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
        self,
        message: str,
        history: list[Turn],
        *,
        name: str | None = None,
        route_label: str = "",
    ) -> TriageResult:
        """상황을 분류하고 급한 순위를 정한다(구조화 출력).

        `route_label`은 **지금 열려 있는 대화방의 할 일 이름**이다. 항목에 매이지
        않은 일반 대화면 빈 문자열이고, 그것이 정상 경로다.

        **화면이 아는 것을 모델에게 알려주는 값이다.** 저리터러시 사용자는 짧게
        묻는다 — "잃어버렸는데 어떡해요?"에는 무엇을 잃어버렸는지가 없다. 방을
        모르는 모델은 그 말만 보고 다른 항목을 고르고, 그 항목이 곁가지 자료의
        출처가 되어 답이 통째로 그쪽으로 샌다(2026-08-31 실사용 결함).

        **핀과는 하는 일이 다르다.** `_pin_route`는 이미 나온 결과의 순서를 바꿀
        뿐이라 잘못 고른 항목이 그대로 남는다. 이 값은 고르기 전에 준다.
        """
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

    async def suggest_questions(
        self, history: list[Turn], *, context: str = "", name: str | None = None
    ) -> tuple[str, ...]:
        """이어서 물어볼 만한 질문을 뽑는다(구조화 출력) — §6.1.

        **`history`의 마지막이 방금 한 답변이다.** 그 답을 봐야 이어서 물을 것이
        정해지므로 `message`를 따로 받지 않는다. 답변 본문도 마스킹 대상이라
        구현이 `history` 전체를 마스킹 경로로 지나 보낸다.

        **거르는 일은 여기서 하지 않는다.** 개수와 모양 판정은
        `domain/suggestions.normalize_suggestions`가 맡는다 — 구현이 셋이라
        어댑터에 두면 세 벌이 되고, 유스케이스 테스트가 그 규칙을 못 잡는다.
        """
        ...
