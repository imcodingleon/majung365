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


# ── SSE 이벤트 (UseCase가 yield) ──
@dataclass(frozen=True)
class TriageEvent:
    routes: tuple[RouteOut, ...]


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


ChatEvent = TriageEvent | TextEvent | CardEvent | DoneEvent | ErrorEvent
