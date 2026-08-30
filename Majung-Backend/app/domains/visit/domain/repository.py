"""방문 요청 저장소 인터페이스 (Domain).

어댑터가 Supabase를 직접 알지 않도록 여기서 모양만 정한다. 테스트에서 가짜
저장소를 끼울 수 있는 이유도 이 인터페이스가 있기 때문이다.
"""

from datetime import datetime
from typing import Protocol
from uuid import UUID

from app.domains.staff.domain.entity import OrgKind
from app.domains.visit.domain.entity import SummaryStatus, VisitRequest, VisitStatus
from app.domains.visit.domain.message import Message, SenderRole


class VisitRepository(Protocol):
    def create(
        self,
        *,
        user_id: UUID,
        route_id: str,
        org_kind: OrgKind,
        preferred_at_1: datetime,
        preferred_at_2: datetime | None,
        prepared_docs: list[str],
        note: str,
        shared_answers: list[dict[str, str]] | None = None,
        consented_at: datetime | None = None,
    ) -> VisitRequest: ...

    def by_user(self, user_id: UUID) -> list[VisitRequest]: ...

    def by_id(self, request_id: UUID) -> VisitRequest | None: ...

    def for_staff(
        self, org_kind: OrgKind, branch: str | None, open_only: bool
    ) -> list[VisitRequest]: ...

    def update_status(
        self,
        request_id: UUID,
        status: VisitStatus,
        *,
        staff_id: UUID | None = None,
        meeting_place: str | None = None,
        confirmed_for: datetime | None = None,
        proposed_at: datetime | None = None,
        cancel_reason: str | None = None,
        now: datetime | None = None,
    ) -> None: ...

    def save_summary(
        self,
        request_id: UUID,
        summary: str,
        status: SummaryStatus,
        *,
        now: datetime,
    ) -> None:
        """담당자가 먼저 읽는 요약을 붙인다 (§7.4).

        **실패도 여기로 남긴다.** 상태만 바꾸는 별도 메서드를 두면, 성공했을 때와
        실패했을 때가 다른 경로를 타게 되어 한쪽만 고치는 일이 생긴다.
        """
        ...


class MessageRepository(Protocol):
    """채팅 메시지 저장소. 어댑터가 Supabase를 직접 알지 않도록 모양만 정한다."""

    def add(
        self,
        *,
        visit_id: UUID,
        sender_role: SenderRole,
        body: str,
        client_msg_id: str = "",
        sender_staff_id: UUID | None = None,
    ) -> tuple[Message, bool]: ...

    def history(
        self, visit_id: UUID, *, before: datetime | None = None
    ) -> list[Message]: ...

    def mark_read(self, visit_id: UUID, role: SenderRole, now: datetime) -> None: ...
