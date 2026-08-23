"""담당자 채팅 유스케이스 (Application) — 기획서 §7.3.

**누가 이 방에 들어올 수 있는가**를 여기서 정한다. 전송 계층(Socket.IO)이 아니라
여기서 정하는 이유는, 나중에 다른 경로가 붙어도 같은 판정을 지나야 하기 때문이다.

방은 방문 요청 단위다. 참여자는 요청한 출소자와 그 요청을 받은 기관의 담당자
둘뿐이고, 담당자가 확인하기 전에는 열리지 않는다(§7.3-4).
"""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from app.domains.staff.domain.entity import Staff
from app.domains.visit.domain.entity import VisitRequest
from app.domains.visit.domain.message import (
    ChatClosed,
    Message,
    SenderRole,
    clean_body,
    ensure_open,
    unread_count,
)
from app.domains.visit.domain.repository import MessageRepository, VisitRepository


class NotInRoom(Exception):
    """이 방의 참여자가 아니다. **왜 아닌지는 알려주지 않는다** —
    요청이 없는 것인지 남의 것인지 구분해 주면 남의 방을 찾는 데 쓰인다."""


@dataclass
class VisitChatUseCase:
    visits: VisitRepository
    messages: MessageRepository

    # ── 입장 판정 ──

    def room_for_user(self, user_id: UUID, visit_id: UUID) -> VisitRequest:
        """출소자 쪽. 자기 요청의 방에만 들어간다."""
        visit = self.visits.by_id(visit_id)
        if visit is None or visit.user_id != user_id:
            raise NotInRoom
        ensure_open(visit)
        return visit

    def room_for_staff(self, staff: Staff, visit_id: UUID) -> VisitRequest:
        """담당자 쪽. **자기 기관으로 온 요청의 방에만 들어간다.**

        배정된 담당자 개인이 아니라 기관 단위로 연다 — 확정 전에는 담당자가 정해지지
        않았고, 확정 뒤에도 그 사람이 자리를 비우면 아무도 답하지 못하게 된다.
        """
        visit = self.visits.by_id(visit_id)
        if visit is None or visit.org_kind != staff.org_kind:
            raise NotInRoom
        ensure_open(visit)
        return visit

    # ── 주고받기 ──

    def send(
        self,
        visit: VisitRequest,
        role: SenderRole,
        raw_body: str,
        *,
        client_msg_id: str = "",
        staff_id: UUID | None = None,
    ) -> tuple[Message, bool]:
        """보낸다. 방이 열려 있는지 다시 본다 —
        입장한 뒤 담당자가 요청을 취소했을 수 있다.

        두 번째 값은 새로 저장했는지다. 재전송이면 False이고, 그때는 에코를
        다시 보내지 않는다.
        """
        ensure_open(visit)
        body = clean_body(raw_body)
        return self.messages.add(
            visit_id=visit.id,
            sender_role=role,
            body=body,
            client_msg_id=client_msg_id,
            sender_staff_id=staff_id,
        )

    def history(
        self, visit: VisitRequest, *, before: datetime | None = None
    ) -> list[Message]:
        """지난 대화. **방이 닫혀도 읽을 수는 있다** — 어제 받은 안내가 사라지면
        안 된다는 것이 대화를 저장하기로 한 이유다(§6.3)."""
        return self.messages.history(visit.id, before=before)

    def mark_read(self, visit: VisitRequest, role: SenderRole, now: datetime) -> None:
        self.messages.mark_read(visit.id, role, now)

    def unread_for(self, visit: VisitRequest, role: SenderRole) -> int:
        """안 읽은 개수. 목록 화면의 빨간 점이 이 값을 쓴다."""
        read_at = (
            visit.user_read_at if role == SenderRole.USER else visit.staff_read_at
        )
        return unread_count(self.history(visit), role, read_at)


__all__ = ["ChatClosed", "NotInRoom", "VisitChatUseCase"]
