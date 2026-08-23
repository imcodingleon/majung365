"""Chat Application DTO — UseCase 입출력. SSE 이벤트의 도메인 표현."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Turn:
    role: str  # "user" | "assistant"
    content: str


@dataclass(frozen=True)
class ChatCommand:
    message: str
    history: tuple[Turn, ...] = ()


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
class DoneEvent:
    pass


@dataclass(frozen=True)
class ErrorEvent:
    message: str = "지금 잠시 연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요."


ChatEvent = (
    TriageEvent | EvidenceEvent | TextEvent | CardEvent | DoneEvent | ErrorEvent
)
