"""방문 도메인이 바깥에 요구하는 것 (Application).

**새 클라이언트 파일을 만들지 않는다.** knowledge 쪽 `StateExtractorLlm`과 같은
방식으로, 여기서 모양만 선언하고 `ClaudeChatLlm`이 구조적으로 그 모양을 만족한다.
Claude 호출은 `chat/adapter/outbound/external/claude_client.py` 한 곳에만 있어야
하기 때문이다(백엔드 MUST 3).
"""

from typing import Protocol


class SummaryLlm(Protocol):
    async def summarize_visit(self, *, text: str, name: str | None = None) -> str:
        """**`name`은 보낼 값이 아니라 지울 값이다.**

        "하고 싶은 말"은 사용자가 직접 타이핑하는 유일한 자리라 이름이 섞인다.
        `assert_masked`는 이름을 패턴으로 알 수 없어 잡아 주지 못하므로, 여기까지
        흘러오지 않으면 이름에 대한 방어가 없는 것과 같다.
        """
        ...
