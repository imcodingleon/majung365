"""담당자 채팅 — 순수 Python (Domain).

기획서 §7.3. **방은 방문 요청 단위다.** 사용자와 지부를 영구히 묶지 않는다.

여기서 가장 중요한 규칙은 **언제 방이 열리는가**다. 담당자가 확인하기 전에는
열지 않는다(§7.3-4). 아무도 안 보는 방에 말을 걸게 두면, 답이 없는 것이 무시가
아니라 아무도 못 본 것인데 사용자는 그것을 구분할 수 없다.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from app.domains.visit.domain.entity import VisitRequest

# 한 번에 보낼 수 있는 길이. 문자 메시지보다 넉넉하되 무제한은 아니다.
MAX_BODY = 2000

# 한 방에서 한 번에 읽어 오는 개수. 그 이상은 더 보기로 이어 받는다.
PAGE_SIZE = 50


class SenderRole(StrEnum):
    """사람이 아니라 역할로 둔다 — 담당자가 교체되어도
    지난 대화의 "누가 말했나"는 바뀌면 안 된다."""

    USER = "user"
    STAFF = "staff"


@dataclass(frozen=True)
class Message:
    id: UUID
    visit_id: UUID
    sender_role: SenderRole
    body: str
    created_at: datetime
    # 낙관적 UI가 임시 말풍선과 서버 에코를 짝짓는 값(§7.3).
    client_msg_id: str = ""
    sender_staff_id: UUID | None = None


class ChatClosed(Exception):
    """방이 아직 열리지 않았거나 이미 닫혔다. 사유를 그대로 사용자에게 보인다."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def ensure_open(visit: VisitRequest) -> None:
    """말을 걸 수 있는 방인지. **열리지 않은 이유를 구분해 알려준다** —
    "아직"과 "이미 끝났다"는 사용자가 할 일이 서로 다르다."""
    if visit.chat_available:
        return
    if visit.status.value in ("completed", "cancelled"):
        raise ChatClosed("이 요청은 끝나서 더 이야기할 수 없어요.")
    raise ChatClosed("담당자가 아직 확인하지 않았어요. 확인하면 여기서 이야기할 수 있어요.")


def clean_body(raw: str) -> str:
    """보낼 수 있는 형태로 다듬는다.

    **빈 메시지는 보내지 않는다.** 실수로 눌린 전송이 상대에게 알림을 울리고
    대화 목록을 채운다. 길이는 자르지 않고 거절한다 — 뒷부분이 조용히 사라지면
    보낸 사람은 다 갔다고 믿는다.
    """
    body = raw.strip()
    if not body:
        raise ChatClosed("보낼 내용을 적어 주세요.")
    if len(body) > MAX_BODY:
        raise ChatClosed(f"한 번에 {MAX_BODY}자까지 보낼 수 있어요.")
    return body


def unread_count(messages: list[Message], role: SenderRole, read_at: datetime | None) -> int:
    """상대가 보낸 것 중 아직 안 읽은 개수. 내가 보낸 것은 세지 않는다."""
    return sum(
        1
        for m in messages
        if m.sender_role != role and (read_at is None or m.created_at > read_at)
    )


def last_message(messages: list[Message]) -> Message | None:
    """마지막으로 오간 말. 목록의 미리보기가 이 값을 쓴다.

    **시간으로 고른다.** 저장소가 시간순으로 준다는 것에 기대지 않는다 — 그 약속이
    한 번 어긋나면 목록에 엉뚱한 줄이 뜨는데, 화면에서는 그것이 틀린 줄 알 수 없다.
    """
    if not messages:
        return None
    return max(messages, key=lambda m: m.created_at)
