"""Chat Application DTO — UseCase 입출력. SSE 이벤트의 도메인 표현."""

from dataclasses import dataclass

from app.domains.knowledge.domain.state import IntakeState
from app.domains.shared.profile import MaskedProfile


@dataclass(frozen=True)
class Turn:
    role: str  # "user" | "assistant"
    content: str


@dataclass(frozen=True)
class ChatCommand:
    message: str
    history: tuple[Turn, ...] = ()
    # 어느 할 일 카드에서 연 대화인가(§6.1).
    #
    # **카드가 대표 경로만 안내하고 세부는 챗봇이 맡기로 했으니, 챗봇이 어느
    # 카드에서 열렸는지는 알아야 그 역할을 할 수 있다.** 없으면 사용자가 매번
    # 자기 상황을 처음부터 다시 설명해야 하는데 저리터러시 전제와 어긋난다.
    #
    # 항목 코드 하나("R14")일 뿐이라 마스킹 대상이 아니다(§9.3). 초기 진단
    # 답변까지 보내는 것은 다른 얘기이며 여기서 하지 않는다.
    route_id: str = ""
    # 가입 때 받은 이름. **모델에게 보낼 값이 아니라 지울 값이다**(§9.3).
    #
    # 마스킹은 이 이름을 알아야 "김판수입니다"를 가릴 수 있다. `assert_masked`는
    # 이름을 패턴으로 알 수 없어 잡아 주지 못하므로, 여기까지 흘러오지 않으면
    # 이름에 대한 방어가 아예 없는 것과 같다.
    #
    # 로그인하지 않고도 챗을 열 수 있어 `None`이 정상 경로다.
    user_name: str | None = None
    # 초기 진단 판정과 진행 상황. **판정만 담고 답변 원문은 담지 않는다** —
    # `IntakeState`가 애초에 그렇게 설계되어 있다(knowledge/domain/state.py).
    #
    # 이것이 없으면 이미 통장을 만든 사람에게도 통장을 만들라는 답이 나간다.
    # 프롬프트에 실을 때 무엇까지 담고 무엇을 빼는지는 chat/domain/user_context.py가
    # 정하며, 거기서 `purpose`와 항목 전체의 보유 상태 표를 빼기로 했다.
    #
    # 저장이 꺼져 있거나 가입 전이면 `None`이고, 그것이 정상 경로다.
    intake: IntakeState | None = None
    # 마스킹을 마친 프로필 — 연령대·출소 후 경과 일수·수용 사유 대분류 (기획서 §9.4).
    #
    # **원본 Profile이 아니라 MaskedProfile이다.** 타입이 다르므로 이름과 생년월일이
    # 여기까지 흘러올 수 없다. 어댑터에서 만들어 즉시 마스킹한다.
    #
    # 수용 사유를 밝히지 않았거나 동의를 철회했으면 `None`이고, 그것이 정상 경로다.
    profile: MaskedProfile | None = None


@dataclass(frozen=True)
class RouteOut:
    """triage가 고른 지원 항목 1개. key는 RouteId 값(R1~R4, R6~R15)."""

    key: str
    label: str
    rank: int
    reason: str


@dataclass(frozen=True)
class CardOption:
    """한 할 일을 신청할 수 있는 경로 하나.

    할 일은 하나인데 신청할 곳이 둘인 경우가 있다(R2: 공단 긴급지원 · 정부 긴급복지).
    카드를 둘로 나누면 사용자가 '둘 다 해야 하나'를 판단해야 하는데, 소득·수급 이력에
    따라 갈려서 **사용자가 판단할 수 없다.** 상담에서 정해질 일이라 한 카드에 묶는다.
    """

    org: str  # 기관명. 화면이 각 경로 앞에 붙인다
    where: str
    next_step: str
    docs: tuple[str, ...] = ()
    # 갈 곳과 거기서 할 말. **전화번호보다 먼저 나간다** — 전화를 걸면 무엇을 물어야
    # 할지 또 판단해야 하지만, 창구에서는 한 문장만 말하면 된다.
    desk_place: str = ""
    desk_say: str = ""
    # 연락처. 기관명 없이 번호만 내지 않는다 — 어디에 거는지 알 수 없다.
    contact_org: str = ""
    contact_phone: str = ""
    contact_hours: str = ""


@dataclass(frozen=True)
class CardData:
    institution_id: str
    name: str
    route_label: str
    summary_easy: str
    where: str
    docs: tuple[str, ...]
    next_step: str
    deadline: str | None
    source_url: str
    # 결과 카드 확장(§4.1). 값이 없으면 화면이 그 자리를 만들지 않는다.
    benefit_summary: str = ""
    eligibility: tuple[str, ...] = ()
    steps: tuple[str, ...] = ()
    cautions: tuple[str, ...] = ()
    # 신청 경로. 항상 최소 하나이고, 둘 이상이면 화면이 기관명을 앞에 붙여 나열한다.
    # where·next_step은 첫 경로와 같은 값이다(단일 경로 화면의 하위 호환).
    options: tuple[CardOption, ...] = ()
    # 근거가 된 공식 페이지들. source_url 하나로는 근거가 여럿인 제도를 못 담는다.
    source_urls: tuple[str, ...] = ()
    # 확인 날짜 안내 문구. 서버가 조립한다 — 날짜만 내려보내면 화면마다
    # "누가 확인한 날짜인지"가 흐려진다. 확인하지 않았으면 빈 문자열이다.
    verified_note: str = ""


# ── SSE 이벤트 (UseCase가 yield) ──
@dataclass(frozen=True)
class TriageEvent:
    routes: tuple[RouteOut, ...]


@dataclass(frozen=True)
class EvidenceEvent:
    """이 답이 어디서 오는지. **웹 검색이면 검색을 시작하기 전에 나간다** —
    확실성이 낮다는 신호가 정보보다 앞서야 하기 때문이다(기획서 §6.4).
    """

    stage: str  # confirmed | web
    notice: str = ""  # 사전 고지. 확인된 자료면 빈 문자열


@dataclass(frozen=True)
class TextEvent:
    delta: str


@dataclass(frozen=True)
class CardEvent:
    card: CardData


@dataclass(frozen=True)
class SuggestionsEvent:
    """이어서 물어볼 만한 질문 셋 (§6.1). **`done` 바로 앞에 나간다** —
    답변 본문이 다 흐른 뒤라야 그 답을 보고 이어서 물을 것이 정해진다.

    **못 만들었으면 이 이벤트 자체가 나가지 않는다.** 빈 목록을 보내면 화면이
    "아직 안 왔다"와 "없다"를 가리지 못한다.
    """

    questions: tuple[str, ...]


@dataclass(frozen=True)
class DoneEvent:
    pass


@dataclass(frozen=True)
class ErrorEvent:
    message: str = "지금 잠시 연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요."


ChatEvent = (
    TriageEvent
    | EvidenceEvent
    | TextEvent
    | CardEvent
    | SuggestionsEvent
    | DoneEvent
    | ErrorEvent
)
