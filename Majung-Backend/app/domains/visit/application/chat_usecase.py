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
    # 담당자가 남의 대화를 열었을 때 남기는 기록 (코드 리뷰 M4).
    #
    # **방이 기관 단위로 열린다**(`room_for_staff`). 같은 기관 담당자면 배정되지 않은
    # 요청의 방에도 들어가 대화 전체를 읽을 수 있고, 그 자체는 담당자 교체를 견디려고
    # 일부러 그렇게 둔 것이다. 다만 **읽었다는 사실이 아무 데도 남지 않으면** 누가
    # 무엇을 보았는지 나중에 셀 수 없다.
    access_log: object | None = None

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
        # **들어간 뒤에 남긴다.** 거절된 시도까지 남기면 남의 방 id를 넣어 본 것과
        # 제 방에 들어간 것이 같은 무게로 쌓여, 정작 읽은 사람을 찾기 어려워진다.
        self._log(staff.id, "chat", visit.user_id)
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

    def _log(self, staff_id: UUID, action: str, target_user_id: UUID | None) -> None:
        """기록이 안 남아도 채팅은 막지 않는다 — 저장이 꺼진 채로도 돌아야 한다.

        `VisitUseCase._log`와 같은 모양이다. 한쪽만 고치면 담당자 행적이 반쪽만 남는다.
        """
        if self.access_log is None:
            return
        record = getattr(self.access_log, "record", None)
        if callable(record):
            record(staff_id, action, target_user_id)


__all__ = ["ChatClosed", "NotInRoom", "VisitChatUseCase"]
