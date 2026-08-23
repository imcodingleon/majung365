"""AnalyzeUseCase — 온보딩 답변(코어 9노드 버튼 + 마지막 자유서술) → 그래프엔진(C7)
→ 오늘의 과제 카드.

자유서술이 있으면 C6(상태추출)이 그래프 전체 노드를 다시 훑어, 언급된 항목만 버튼 답변 위에 덮어쓴다
(가장 최근 정보로 간주). 세션/진행상태 저장 없음(stateless) — 요청 1번에 응답 1번으로 끝난다.
"""

import logging

from app.domains.knowledge.application.dto import AnalyzeCommand, TaskCard
from app.domains.knowledge.application.port import StateExtractorLlm
from app.domains.knowledge.domain.graph_engine import (
    GraphNode,
    NodeState,
    StartingTask,
    compute_starting_task,
)
from app.domains.knowledge.domain.repository import InstitutionRepository

logger = logging.getLogger("majung.knowledge")


class AnalyzeUseCase:
    def __init__(
        self,
        llm: StateExtractorLlm,
        institutions: InstitutionRepository,
        graph_nodes: dict[str, GraphNode],
    ) -> None:
        self._llm = llm
        self._institutions = institutions
        self._nodes = graph_nodes

    async def run(self, cmd: AnalyzeCommand) -> TaskCard:
        states: dict[str, NodeState] = {
            a.node_id: a.state for a in cmd.answers if a.node_id in self._nodes
        }
        # 답하지 않은 노드(단말 노드 등)는 X로 가정 — graph-design.md "코어 깊게 + 단말 얕게"
        for node_id in self._nodes:
            states.setdefault(node_id, NodeState.X)

        narrative = (cmd.narrative or "").strip()
        if narrative:
            node_names = {nid: node.name for nid, node in self._nodes.items()}
            try:
                narrative_states = await self._llm.extract_narrative_states(node_names, narrative)
                states.update(narrative_states)  # 서술이 버튼 답변보다 최신 정보로 우선
            except Exception:
                # 사용자 입력 원문은 로그에 남기지 않는다
                logger.warning("서술 상태 판정 실패 (upstream) — 버튼 답변만 사용")

        task = compute_starting_task(self._nodes, states)
        return self._to_card(task, states)

    def _to_card(self, task: StartingTask, states: dict[str, NodeState]) -> TaskCard:
        inst = self._institutions.by_id(task.kb_ref)
        if inst is None:
            # 환각 차단 — KB 미매칭이면 사실 문장을 전부 비운다.
            # 확장 필드(지원 내용·먼저 확인할 것·절차·주의)도 사실이라 기본값인 빈 값으로 둔다.
            logger.warning("kb_ref 미매칭 — 사실 문장 미출력: %s", task.kb_ref)
            return TaskCard(
                node_id=task.node_id,
                node_name=task.node_name,
                summary_easy="",
                where=task.where,
                docs=task.docs,
                next_step="",
                deadline=task.deadline_text,
                source_url="",
                priority_reason=task.priority_reason,
                duration_days=task.duration_days,
                is_fallback=task.is_fallback,
                resolved_states=dict(states),
            )
        return TaskCard(
            node_id=task.node_id,
            node_name=task.node_name,
            summary_easy=inst.summary_easy,
            where=inst.where,
            docs=inst.docs,
            next_step=inst.next_step,
            deadline=task.deadline_text or inst.deadline,
            source_url=inst.source_url,
            priority_reason=task.priority_reason,
            duration_days=task.duration_days,
            is_fallback=task.is_fallback,
            resolved_states=dict(states),
            benefit_summary=inst.benefit_summary,
            eligibility=inst.eligibility,
            steps=inst.steps,
            cautions=inst.cautions,
        )
