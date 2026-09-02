"""Knowledge가 의존하는 외부 포트 — 상태추출 LLM(C6)과 순서 결정 LLM.

구현은 chat 도메인의 claude_client.py/mock_client.py(adapter/outbound/external)에 둔다 —
"Claude 호출은 claude_client.py에서만" 규칙(Majung-Backend/CLAUDE.md) 때문에 새 클라이언트
파일을 만들지 않고, 기존 ClaudeChatLlm/MockChatLlm이 이 Protocol도 구조적으로 만족시킨다.
"""

from typing import Protocol

from app.domains.knowledge.domain.graph_engine import NodeState


class StateExtractorLlm(Protocol):
    async def extract_narrative_states(
        self, nodes: dict[str, str], narrative: str, *, name: str | None = None
    ) -> dict[str, NodeState]:
        """자유 서술 1건을 읽고, 언급된 노드들의 상태(O/X/BLOCKED)만 판정해 돌려준다.
        언급되지 않은 노드는 결과에 포함하지 않는다.

        **`name`은 보낼 값이 아니라 지울 값이다.** 자유서술은 사용자가 자기 사정을
        길게 쓰는 자리라 이름이 가장 잘 섞이는데, `assert_masked`는 이름을 패턴으로
        알 수 없어 잡아 주지 못한다. 로그인하지 않았으면 `None`이다.
        """
        ...


class TaskOrderLlm(Protocol):
    async def order_tasks(self, payload: str) -> tuple[str, ...]:
        """할 일 순서만 정한다. **문장은 만들지 않는다.**

        돌려주는 것은 항목 코드 목록뿐이다. 왜 그 순서인지 묻지 않는 이유는
        `chat/domain/prompts.py` 머리말과 같다 — 자유 문구에 수용 사유가 실린다.

        **실패·시간초과면 빈 튜플이다. 예외를 밖으로 던지지 않는다.** 순서를 못
        정했다고 가입이 막히면 사용자는 27문항을 다시 답해야 하는데, 그 대가로
        얻는 것이 순서 하나다. 부르는 쪽이 지금까지의 순서로 물러선다.
        """
        ...
