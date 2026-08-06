"""Knowledge Application DTO — 온보딩 분석(AnalyzeUseCase) 입출력."""

from dataclasses import dataclass

from app.domains.knowledge.domain.graph_engine import NodeState


@dataclass(frozen=True)
class NodeAnswer:
    node_id: str
    state: NodeState


@dataclass(frozen=True)
class AnalyzeCommand:
    answers: tuple[NodeAnswer, ...]
    # 온보딩 마지막 자유서술(선택). 있으면 C6이 14노드 전체를 다시 검토해
    # 언급된 항목의 상태를 버튼 답변보다 우선 적용한다.
    narrative: str | None = None


@dataclass(frozen=True)
class TaskCard:
    node_id: str
    node_name: str
    summary_easy: str
    where: str
    docs: tuple[str, ...]
    next_step: str
    deadline: str | None
    source_url: str
    priority_reason: str
    duration_days: int
    is_fallback: bool
    # 이번 계산에 쓰인 14노드 전체 상태 스냅샷. "완료 처리" 시 프론트가 이 노드만 O로 바꿔
    # 그대로 재전송하면 재계산이 된다 — LLM(C6) 재호출 없이 다음 과제를 구할 수 있다.
    resolved_states: dict[str, NodeState]
