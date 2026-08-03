"""Knowledge Application DTO — 온보딩 분석(AnalyzeUseCase) 입출력."""

from dataclasses import dataclass

from app.domains.knowledge.domain.graph_engine import NodeState


@dataclass(frozen=True)
class NodeAnswer:
    node_id: str
    # 버튼 선택이면 O/X/BLOCKED/UNKNOWN, "기타(직접입력)"면 None(free_text를 대신 본다)
    state: NodeState | None
    free_text: str | None = None


@dataclass(frozen=True)
class AnalyzeCommand:
    answers: tuple[NodeAnswer, ...]


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
