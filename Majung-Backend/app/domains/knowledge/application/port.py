"""Knowledge(온보딩 분석)이 의존하는 외부 포트 — 상태추출 LLM(C6).

구현은 chat 도메인의 claude_client.py/mock_client.py(adapter/outbound/external)에 둔다 —
"Claude 호출은 claude_client.py에서만" 규칙(Majung-Backend/CLAUDE.md) 때문에 새 클라이언트
파일을 만들지 않고, 기존 ClaudeChatLlm/MockChatLlm이 이 Protocol도 구조적으로 만족시킨다.
"""

from typing import Protocol

from app.domains.knowledge.domain.graph_engine import NodeState


class StateExtractorLlm(Protocol):
    async def extract_narrative_states(
        self, nodes: dict[str, str], narrative: str
    ) -> dict[str, NodeState]:
        """자유 서술 1건을 읽고, 언급된 노드들의 상태(O/X/BLOCKED)만 판정해 돌려준다.
        언급되지 않은 노드는 결과에 포함하지 않는다."""
        ...
