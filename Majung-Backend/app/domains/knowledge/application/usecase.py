"""AnalyzeUseCase — 온보딩 답변(코어 9노드) → (기타 있으면 C6) → 그래프엔진(C7) → 오늘의 과제 카드.

세션/진행상태 저장 없음(stateless) — 요청 1번에 응답 1번으로 끝난다.
"""

import logging

from app.domains.knowledge.application.dto import AnalyzeCommand, NodeAnswer, TaskCard
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
        states = await self._resolve_states(cmd.answers)
        # 답하지 않은 노드(단말 5개 등)는 X로 가정 — graph-design.md "코어 깊게 + 단말 얕게"
        for node_id in self._nodes:
            states.setdefault(node_id, NodeState.X)

        task = compute_starting_task(self._nodes, states)
        return self._to_card(task)

    async def _resolve_states(self, answers: tuple[NodeAnswer, ...]) -> dict[str, NodeState]:
        states: dict[str, NodeState] = {}
        for answer in answers:
            if answer.node_id not in self._nodes:
                continue  # 알 수 없는 노드 id는 무시(방어적)
            if answer.state is not None:
                states[answer.node_id] = answer.state
                continue
            # "기타(직접입력)" — 그 자리에서 C6 상태 판정
            node_name = self._nodes[answer.node_id].name
            text = (answer.free_text or "").strip()
            if not text:
                states[answer.node_id] = NodeState.UNKNOWN
                continue
            try:
                states[answer.node_id] = await self._llm.extract_node_state(node_name, text)
            except Exception:
                # 사용자 입력 원문은 로그에 남기지 않는다
                logger.warning("상태 판정 실패 (upstream) — UNKNOWN 처리")
                states[answer.node_id] = NodeState.UNKNOWN
        return states

    def _to_card(self, task: StartingTask) -> TaskCard:
        inst = self._institutions.by_id(task.kb_ref)
        if inst is None:
            # 환각 차단 — KB 미매칭이면 사실 문장(요약·서류·다음단계·출처)을 비운다
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
        )
