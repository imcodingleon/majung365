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
    # 가입 때 받은 이름. **모델에게 보낼 값이 아니라 지울 값이다**(§9.3).
    # 헤더에 토큰이 없으면 `None`이고, 그때는 정규식이 문맥으로 잡는 이름만 가려진다.
    user_name: str | None = None


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
class NoticeSource:
    """근거 조문 하나. 화면에 짧게 나가고 국가법령정보센터로 링크가 붙는다."""

    label: str
    url: str
    # 조문에서 그대로 옮긴 한 구절. **쉬운 말로 푼 안내 다음에 이것이 온다** —
    # 풀어 쓴 문장만 있으면 사용자가 우리 해석을 그대로 믿어야 하는데, 원문이
    # 함께 있으면 창구에서 그 문장을 짚어 보일 수도 있다.
    #
    # 비어 있을 수 있다. 그때는 화면이 이 줄을 그리지 않는다.
    quote: str = ""


@dataclass(frozen=True)
class RouteNotice:
    """수용 사유에 따라 달라지는 안내 (기획서 §9.4 · 2026-09-02 결정).

    **IntakeCard가 아니라 여기 있다.** 카드는 제도 원본이라 모든 사용자에게 같은
    값이고, 이것은 사람마다 다른 판정이다. 층을 섞으면 무엇을 캐시해도 되고 무엇을
    암호화해야 하는지가 곧 어긋난다.

    문장은 LLM이 만들지 않는다 — `legal_constraints.json`의 검수된 문장이
    그대로 나간다.
    """

    tone: str  # "blocked" | "caution" | "clear"
    headline: str
    body: str
    myth: str
    what_to_do: str
    sources: tuple[NoticeSource, ...]
    # "이 안내는 마중365가 ○월 ○일에 확인했어요." 날짜가 없으면 빈 문자열이고
    # 화면은 그 줄을 그리지 않는다(§6.4).
    verified_note: str


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
    # 이 항목으로 방문 요청을 보낼 수 있는가(§7).
    #
    # **화면이 이 표를 복사해 들고 있으면 언젠가 갈린다.** 통장은 은행, 증명서는
    # 교정시설, 빚은 법원이라 우리 담당자가 없는데, 화면이 그것을 모르면 §7 기능이
    # 어느 카드에도 안 나오거나 받을 수 없는 항목에 버튼이 뜬다.
    can_request_visit: bool
    card: IntakeCard
    # 대화를 열었을 때 입력창 위에 뜨는 첫 질문(§6.1). **비어 있는 것이 정상 경로다** —
    # 표에 아직 없는 항목이면 화면이 기본 문구로 물러선다.
    #
    # 제도가 아니라 항목에 매단 이유는 `shared/starter_questions.py`에 적어 두었다.
    starter_questions: tuple[str, ...] = ()
    # 수용 사유에 따라 달라지는 안내. **비어 있는 것이 정상 경로다** —
    # 밝히지 않았거나 그 항목에 걸리는 제약이 없는 경우가 대부분이다.
    #
    # 저장하지 않고 요청마다 조립한다. 동의를 철회하면 다음 요청부터 사라진다.
    notices: tuple[RouteNotice, ...] = ()
