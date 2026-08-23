"""방문 요청 저장소 인터페이스 (Domain).

어댑터가 Supabase를 직접 알지 않도록 여기서 모양만 정한다. 테스트에서 가짜
저장소를 끼울 수 있는 이유도 이 인터페이스가 있기 때문이다.
"""

from datetime import datetime
from typing import Protocol
from uuid import UUID

from app.domains.staff.domain.entity import OrgKind
from app.domains.visit.domain.entity import VisitRequest, VisitStatus


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
        proposed_at: datetime | None = None,
        cancel_reason: str | None = None,
        now: datetime | None = None,
    ) -> None: ...
