"""담당자 채팅 — 기획서 §7.3.

**누가 이 방에 들어올 수 있는가**가 여기서 가장 중요하다. 대화 내용은 민감정보이고
(§9.3), 남의 방이 열리면 출소 사실과 사적인 사정이 함께 새어 나간다.

전송 계층(Socket.IO)은 규칙을 갖지 않는다. 판정을 소켓 사건에 잇는 일만 하므로
여기서 규칙을 검증하면 그 경로도 함께 덮인다.
"""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from app.domains.staff.domain.entity import OrgKind, Staff
from app.domains.visit.application.chat_usecase import (
    ChatClosed,
    NotInRoom,
    VisitChatUseCase,
)
from app.domains.visit.domain.entity import VisitRequest, VisitStatus
from app.domains.visit.domain.message import MAX_BODY, Message, SenderRole

NOW = datetime(2026, 8, 23, 10, 0, tzinfo=UTC)
USER = uuid4()


class FakeMessageRepository:
    def __init__(self) -> None:
        self.rows: list[Message] = []
        self.read: dict[tuple[UUID, SenderRole], datetime] = {}

    def add(
        self,
        *,
        visit_id: UUID,
        sender_role: SenderRole,
        body: str,
        client_msg_id: str = "",
        sender_staff_id: UUID | None = None,
    ) -> Message:
        if client_msg_id:
            for existing in self.rows:
                if existing.visit_id == visit_id and existing.client_msg_id == client_msg_id:
                    return existing
        saved = Message(
            id=uuid4(),
            visit_id=visit_id,
            sender_role=sender_role,
            body=body,
            created_at=NOW + timedelta(seconds=len(self.rows)),
            client_msg_id=client_msg_id,
            sender_staff_id=sender_staff_id,
        )
        self.rows.append(saved)
        return saved

    def history(
        self, visit_id: UUID, *, before: datetime | None = None
    ) -> list[Message]:
        found = [m for m in self.rows if m.visit_id == visit_id]
        if before is not None:
            found = [m for m in found if m.created_at < before]
        return sorted(found, key=lambda m: m.created_at)

    def mark_read(self, visit_id: UUID, role: SenderRole, now: datetime) -> None:
        self.read[(visit_id, role)] = now


class FakeVisitRepository:
    def __init__(self, visit: VisitRequest) -> None:
        self.visit = visit

    def by_id(self, request_id: UUID) -> VisitRequest | None:
        return self.visit if request_id == self.visit.id else None

    # 이 테스트에서 쓰지 않는 나머지 — 인터페이스를 맞추기 위한 자리다.
    def create(self, **kwargs: object) -> VisitRequest:  # pragma: no cover
        raise NotImplementedError

    def by_user(self, user_id: UUID) -> list[VisitRequest]:  # pragma: no cover
        return [self.visit] if self.visit.user_id == user_id else []

    def for_staff(self, *args: object, **kwargs: object) -> list[VisitRequest]:
        return [self.visit]  # pragma: no cover

    def update_status(self, *args: object, **kwargs: object) -> None:  # pragma: no cover
        raise NotImplementedError


def make_visit(status: VisitStatus = VisitStatus.ACKNOWLEDGED) -> VisitRequest:
    return VisitRequest(
        id=uuid4(),
        user_id=USER,
        route_id="R1",
        org_kind=OrgKind.KOREHA,
        status=status,
        preferred_at_1=NOW + timedelta(days=2),
        preferred_at_2=None,
    )


def make_staff(org: OrgKind = OrgKind.KOREHA) -> Staff:
    return Staff(
        id=uuid4(),
        login_id="admin1",
        org_kind=org,
        branch="경기지부",
        display_name="경기지부 담당자",
    )


def make_usecase(visit: VisitRequest) -> tuple[VisitChatUseCase, FakeMessageRepository]:
    messages = FakeMessageRepository()
    return VisitChatUseCase(visits=FakeVisitRepository(visit), messages=messages), messages


# ── 방이 열리는 조건 ──


def test_room_stays_closed_until_staff_acknowledges() -> None:
    """**아무도 안 보는 방에 말을 걸게 두지 않는다**(§7.3-4).

    답이 없는 것이 무시인지 아무도 못 본 것인지 사용자는 구분할 수 없다.
    """
    visit = make_visit(VisitStatus.SENT)
    usecase, _ = make_usecase(visit)
    with pytest.raises(ChatClosed) as err:
        usecase.room_for_user(USER, visit.id)
    assert "아직 확인하지" in err.value.reason


def test_finished_room_says_so_differently() -> None:
    """"아직"과 "이미 끝났다"는 사용자가 할 일이 서로 다르다."""
    for status in (VisitStatus.COMPLETED, VisitStatus.CANCELLED):
        visit = make_visit(status)
        usecase, _ = make_usecase(visit)
        with pytest.raises(ChatClosed) as err:
            usecase.room_for_user(USER, visit.id)
        assert "끝나서" in err.value.reason


def test_confirmed_room_is_open() -> None:
    visit = make_visit(VisitStatus.CONFIRMED)
    usecase, _ = make_usecase(visit)
    assert usecase.room_for_user(USER, visit.id).id == visit.id


# ── 누가 들어올 수 있는가 ──


def test_other_user_cannot_enter() -> None:
    """남의 방이 열리면 출소 사실과 사적인 사정이 함께 샌다."""
    visit = make_visit()
    usecase, _ = make_usecase(visit)
    with pytest.raises(NotInRoom):
        usecase.room_for_user(uuid4(), visit.id)


def test_missing_room_looks_the_same_as_someone_elses() -> None:
    """없는 요청인지 남의 것인지 구분해 주면 남의 방을 찾는 데 쓰인다."""
    visit = make_visit()
    usecase, _ = make_usecase(visit)
    with pytest.raises(NotInRoom):
        usecase.room_for_user(USER, uuid4())


def test_staff_enters_by_org_not_by_assignment() -> None:
    """**기관 단위로 연다.** 확정 전에는 담당자가 정해지지 않았고, 확정 뒤에도
    그 사람이 자리를 비우면 아무도 답하지 못하게 된다."""
    visit = make_visit()
    usecase, _ = make_usecase(visit)
    assert usecase.room_for_staff(make_staff(OrgKind.KOREHA), visit.id).id == visit.id


def test_staff_of_other_org_cannot_enter() -> None:
    visit = make_visit()
    usecase, _ = make_usecase(visit)
    with pytest.raises(NotInRoom):
        usecase.room_for_staff(make_staff(OrgKind.CENTER), visit.id)


# ── 주고받기 ──


def test_resend_does_not_pile_up() -> None:
    """**낙관적 UI는 재전송을 부른다.** 임시 말풍선이 떠 있는 동안 사용자가 다시
    누르면 같은 말이 두 번 쌓인다. clientMsgId로 같은 것을 알아본다."""
    visit = make_visit()
    usecase, messages = make_usecase(visit)
    first = usecase.send(visit, SenderRole.USER, "서류 뭐 가져가요?", client_msg_id="tmp-1")
    again = usecase.send(visit, SenderRole.USER, "서류 뭐 가져가요?", client_msg_id="tmp-1")
    assert first.id == again.id
    assert len(messages.rows) == 1


def test_empty_message_is_refused() -> None:
    """실수로 눌린 전송이 상대에게 알림을 울리고 대화 목록을 채운다."""
    visit = make_visit()
    usecase, _ = make_usecase(visit)
    for blank in ("", "   ", "\n\n"):
        with pytest.raises(ChatClosed):
            usecase.send(visit, SenderRole.USER, blank)


def test_too_long_message_is_refused_not_trimmed() -> None:
    """**자르지 않고 거절한다.** 뒷부분이 조용히 사라지면 보낸 사람은 다 갔다고 믿는다."""
    visit = make_visit()
    usecase, _ = make_usecase(visit)
    with pytest.raises(ChatClosed) as err:
        usecase.send(visit, SenderRole.USER, "가" * (MAX_BODY + 1))
    assert str(MAX_BODY) in err.value.reason


def test_sending_into_a_closed_room_is_refused() -> None:
    """입장한 뒤 담당자가 요청을 취소했을 수 있다."""
    visit = make_visit()
    usecase, _ = make_usecase(visit)
    usecase.send(visit, SenderRole.USER, "안녕하세요")
    cancelled = replace(visit, status=VisitStatus.CANCELLED)
    with pytest.raises(ChatClosed):
        usecase.send(cancelled, SenderRole.USER, "하나 더 물어볼게요")


# ── 읽음 표시 ──


def test_unread_counts_only_the_other_side() -> None:
    visit = make_visit()
    usecase, _ = make_usecase(visit)
    usecase.send(visit, SenderRole.USER, "질문이요")
    usecase.send(visit, SenderRole.STAFF, "네 말씀하세요")
    usecase.send(visit, SenderRole.STAFF, "무엇이든 물어보세요")

    # 출소자는 담당자가 보낸 둘이 안 읽은 것이고, 자기가 보낸 것은 세지 않는다.
    assert usecase.unread_for(visit, SenderRole.USER) == 2
    assert usecase.unread_for(visit, SenderRole.STAFF) == 1


def test_read_marker_clears_the_count() -> None:
    visit = make_visit()
    usecase, _ = make_usecase(visit)
    usecase.send(visit, SenderRole.STAFF, "확인했어요")
    read = replace(visit, user_read_at=NOW + timedelta(minutes=5))
    assert usecase.unread_for(read, SenderRole.USER) == 0


def test_history_is_readable_after_the_room_closes() -> None:
    """**어제 받은 안내가 사라지면 안 된다**(§6.3). 방이 닫혀도 읽을 수는 있다."""
    visit = make_visit()
    usecase, _ = make_usecase(visit)
    usecase.send(visit, SenderRole.STAFF, "2층 상담실로 오세요")
    done = replace(visit, status=VisitStatus.COMPLETED)
    assert [m.body for m in usecase.history(done)] == ["2층 상담실로 오세요"]
