"""방문 요청 — 순수 Python (Domain).

기획서 §7. 목적은 대면 부담을 줄이는 것이다. **만날 사람이 정해진 상태로
방문하게 한다** — "창구에서 신분이 드러나는 순간이 실질적 장벽"이라는 인터뷰
결과의 해법은 시간 예약이 아니라 누구를 찾아가면 되는지 아는 것이다.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from app.domains.staff.domain.entity import OrgKind


class VisitStatus(StrEnum):
    SENT = "sent"  # 담당자에게 전달했어요
    ACKNOWLEDGED = "acknowledged"  # 담당자가 확인했어요 — 여기서부터 채팅이 열린다
    CONFIRMED = "confirmed"  # 시간·장소·담당자가 정해졌어요
    RESCHEDULE_PROPOSED = "reschedule_proposed"  # 담당자가 다른 시간을 제안했어요
    COMPLETED = "completed"  # 방문 완료 — 해당 탭의 완료 처리로 이어진다
    CANCELLED = "cancelled"


# 상태별로 갈 수 있는 다음 상태. 표에 없는 전이는 막는다 —
# "완료된 요청이 다시 확정으로" 같은 일이 조용히 일어나면 안 된다.
_NEXT: dict[VisitStatus, frozenset[VisitStatus]] = {
    VisitStatus.SENT: frozenset(
        {VisitStatus.ACKNOWLEDGED, VisitStatus.CANCELLED}
    ),
    VisitStatus.ACKNOWLEDGED: frozenset(
        {VisitStatus.CONFIRMED, VisitStatus.RESCHEDULE_PROPOSED, VisitStatus.CANCELLED}
    ),
    VisitStatus.CONFIRMED: frozenset(
        {VisitStatus.COMPLETED, VisitStatus.RESCHEDULE_PROPOSED, VisitStatus.CANCELLED}
    ),
    VisitStatus.RESCHEDULE_PROPOSED: frozenset(
        {VisitStatus.CONFIRMED, VisitStatus.CANCELLED}
    ),
    # 끝난 요청은 되돌리지 않는다. 다시 필요하면 새 요청을 보낸다.
    VisitStatus.COMPLETED: frozenset(),
    VisitStatus.CANCELLED: frozenset(),
}

# 아직 결론이 나지 않은 상태들. 상한 판정(§7.5)이 이 집합을 센다.
OPEN_STATUSES: frozenset[VisitStatus] = frozenset(
    {VisitStatus.SENT, VisitStatus.ACKNOWLEDGED, VisitStatus.RESCHEDULE_PROPOSED}
)


def can_move(current: VisitStatus, target: VisitStatus) -> bool:
    return target in _NEXT[current]


@dataclass(frozen=True)
class SharedAnswer:
    """담당자에게 보내는 초기 진단 답 한 줄 (§7.4).

    **문항 id가 아니라 사람이 읽는 문장으로 담는다.** 담당자 화면은 문항 정의를
    알 수 없고, 알게 하면 그 정의가 두 군데에 있게 된다.
    """

    route_id: str
    section: str
    question: str
    answer: str


@dataclass(frozen=True)
class VisitRequest:
    id: UUID
    user_id: UUID
    route_id: str
    org_kind: OrgKind
    status: VisitStatus
    preferred_at_1: datetime
    preferred_at_2: datetime | None
    prepared_docs: tuple[str, ...] = field(default_factory=tuple)
    note: str = ""
    # 하루 상한(§7.5)을 세는 기준. 저장소가 채운다.
    created_at: datetime | None = None

    # ── 확정 정보 ──
    # **이 둘이 함께 있어야 의미가 있다.** 시간만 정해지고 누구를 찾아갈지 모르면
    # 창구에서 다시 설명해야 하고, 그 순간이 이 서비스가 없애려는 장벽이다.
    assigned_staff_id: UUID | None = None
    assigned_staff_name: str = ""
    meeting_place: str = ""
    # 확정 처리를 누른 시각. **만나기로 한 시각이 아니다.**
    confirmed_at: datetime | None = None
    # 만나기로 한 시각(§7.1). 담당자가 보내지 않으면 1지망으로 채운다.
    confirmed_for: datetime | None = None

    proposed_at: datetime | None = None
    cancel_reason: str = ""

    # ── 담당자에게 보낸 진단 답변 (§7.4) ──
    # **동의가 있을 때만 채워진다.** 없으면 빈 튜플이고, 담당자 화면에도 안 나간다.
    shared_answers: tuple[SharedAnswer, ...] = ()
    shared_answers_consented_at: datetime | None = None

    # ── 채팅 읽음 표시 (§7.3) ──
    # 참여자가 요청한 사람과 담당 기관 둘뿐이라 별도 테이블 대신 여기에 둔다.
    user_read_at: datetime | None = None
    staff_read_at: datetime | None = None

    @property
    def is_open(self) -> bool:
        return self.status in OPEN_STATUSES

    @property
    def chat_available(self) -> bool:
        """담당자가 확인하기 전에는 채팅을 열지 않는다(§7.3-4).
        아무도 안 보는 방에 말을 걸게 두지 않는다."""
        return self.status in (
            VisitStatus.ACKNOWLEDGED,
            VisitStatus.CONFIRMED,
            VisitStatus.RESCHEDULE_PROPOSED,
        )
