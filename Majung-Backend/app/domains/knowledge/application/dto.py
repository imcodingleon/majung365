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
    # 온보딩 마지막 자유서술(선택). 있으면 C6이 그래프 전체 노드를 다시 검토해
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
    # 이번 계산에 쓰인 그래프 전체 노드 상태 스냅샷. "완료 처리" 시 프론트가 이 노드만 O로 바꿔
    # 그대로 재전송하면 재계산이 된다 — LLM(C6) 재호출 없이 다음 과제를 구할 수 있다.
    resolved_states: dict[str, NodeState]
    # 결과 카드 확장(§4.1). KB에서 그대로 실어 나른다.
    benefit_summary: str = ""
    eligibility: tuple[str, ...] = ()
    steps: tuple[str, ...] = ()
    cautions: tuple[str, ...] = ()
    source_urls: tuple[str, ...] = ()
    verified_note: str = ""


@dataclass(frozen=True)
class IntakeCardOption:
    """한 할 일을 신청할 수 있는 경로 하나. 둘 이상이면 화면이 기관명을 앞에 붙여 나열한다."""

    org: str
    where: str
    next_step: str
    docs: tuple[str, ...] = ()
    desk_place: str = ""
    desk_say: str = ""
    contact_org: str = ""
    contact_phone: str = ""
    contact_hours: str = ""


@dataclass(frozen=True)
class IntakeCard:
    """제도 원본. 모든 사용자에게 같은 값이라 사용자별 판정과 섞지 않는다."""

    institution_id: str
    name: str
    summary_easy: str
    docs: tuple[str, ...]
    deadline: str | None
    source_url: str
    benefit_summary: str
    eligibility: tuple[str, ...]
    steps: tuple[str, ...]
    cautions: tuple[str, ...]
    options: tuple[IntakeCardOption, ...]
    source_urls: tuple[str, ...] = ()
    verified_note: str = ""


@dataclass(frozen=True)
class IntakeTask:
    """할 일 하나. 지원 항목 하나이자 화면의 인덱스 탭 하나다."""

    route_id: str
    route_label: str
    # 인덱스 탭용 짧은 이름(5자 이내). route_label을 자르면 말이 끊긴다.
    tab_label: str
    section_id: str
    section_label: str
    # 다른 항목의 선행조건인지 — 사용자별 판정이 아니라 그래프 구조의 사실이다.
    blocks_others: bool
    card: IntakeCard
