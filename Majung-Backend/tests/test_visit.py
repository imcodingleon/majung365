"""방문 요청 — 기획서 §7.

이 기능의 목적은 시간을 잡아 주는 것이 아니라 **만날 사람이 정해진 상태로
방문하게 하는 것**이다. 그래서 "장소 없는 확정을 거부한다"가 여기서 가장 중요한
테스트다. 나머지는 그 약속을 지키기 위한 울타리다.
"""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from app.domains.staff.domain.entity import OrgKind, Staff
from app.domains.visit.application.usecase import VisitError, VisitUseCase
from app.domains.visit.domain.entity import (
    SharedAnswer,
    VisitRequest,
    VisitStatus,
    can_move,
)
from app.domains.visit.domain.limits import LimitKind

NOW = datetime(2026, 8, 23, 9, 0, tzinfo=UTC)
SOON = NOW + timedelta(days=1)
USER = uuid4()


class FakeVisitRepository:
    """메모리 저장소. 규칙을 DB 없이 검증하려고 둔다."""

    def __init__(self, seed: list[VisitRequest] | None = None) -> None:
        self.rows: dict[UUID, VisitRequest] = {r.id: r for r in (seed or [])}

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
    ) -> VisitRequest:
        created = VisitRequest(
            id=uuid4(),
            user_id=user_id,
            route_id=route_id,
            org_kind=org_kind,
            status=VisitStatus.SENT,
            preferred_at_1=preferred_at_1,
            preferred_at_2=preferred_at_2,
            prepared_docs=tuple(prepared_docs),
            note=note,
            created_at=NOW,
            shared_answers=tuple(
                SharedAnswer(
                    route_id=str(a.get("route_id", "")),
                    section=str(a.get("section", "")),
                    question=str(a.get("question", "")),
                    answer=str(a.get("answer", "")),
                )
                for a in (shared_answers or [])
            ),
            shared_answers_consented_at=consented_at,
        )
        self.rows[created.id] = created
        return created

    def by_user(self, user_id: UUID) -> list[VisitRequest]:
        return [r for r in self.rows.values() if r.user_id == user_id]

    def by_id(self, request_id: UUID) -> VisitRequest | None:
        return self.rows.get(request_id)

    def for_staff(
        self, org_kind: OrgKind, branch: str | None, open_only: bool
    ) -> list[VisitRequest]:
        found = [r for r in self.rows.values() if r.org_kind == org_kind]
        return [r for r in found if r.is_open] if open_only else found

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
    ) -> None:
        current = self.rows[request_id]
        patch: dict[str, object] = {"status": status}
        if status == VisitStatus.CONFIRMED:
            patch["assigned_staff_id"] = staff_id
            patch["assigned_staff_name"] = "경기지부 담당자"
            patch["meeting_place"] = meeting_place or ""
            patch["confirmed_at"] = now
            patch["confirmed_for"] = confirmed_for
        if proposed_at is not None:
            patch["proposed_at"] = proposed_at
        if cancel_reason is not None:
            patch["cancel_reason"] = cancel_reason
        self.rows[request_id] = replace(current, **patch)  # type: ignore[arg-type]


class FakeAccessLog:
    def __init__(self) -> None:
        self.entries: list[tuple[UUID, str, UUID | None]] = []

    def record(self, staff_id: UUID, action: str, target_user_id: UUID | None) -> None:
        self.entries.append((staff_id, action, target_user_id))


def make_staff(org: OrgKind = OrgKind.KOREHA) -> Staff:
    return Staff(
        id=uuid4(),
        login_id="admin1",
        org_kind=org,
        branch="경기지부",
        display_name="경기지부 담당자",
    )


def make_usecase(
    seed: list[VisitRequest] | None = None,
) -> tuple[VisitUseCase, FakeVisitRepository, FakeAccessLog]:
    repo = FakeVisitRepository(seed)
    log = FakeAccessLog()
    return VisitUseCase(visits=repo, access_log=log), repo, log


def send(usecase: VisitUseCase, route_id: str = "R1", **kwargs: object) -> VisitRequest:
    params: dict[str, object] = {
        "user_id": USER,
        "route_id": route_id,
        "preferred_at_1": SOON,
        "preferred_at_2": None,
        "prepared_docs": [],
        "note": "",
        "now": NOW,
    }
    params.update(kwargs)
    return usecase.request_visit(**params)  # type: ignore[arg-type]


# ── 상태 전이 ──


def test_completed_request_never_reopens() -> None:
    """끝난 요청이 조용히 되살아나면 안 된다."""
    for target in VisitStatus:
        assert not can_move(VisitStatus.COMPLETED, target)
        assert not can_move(VisitStatus.CANCELLED, target)


def test_sent_cannot_jump_to_confirmed() -> None:
    """담당자가 확인하기 전에 확정될 수 없다 — 확인을 건너뛴 확정은 근거가 없다."""
    assert not can_move(VisitStatus.SENT, VisitStatus.CONFIRMED)
    assert can_move(VisitStatus.SENT, VisitStatus.ACKNOWLEDGED)


def test_chat_opens_only_after_acknowledged() -> None:
    """아무도 안 보는 방에 말을 걸게 두지 않는다(§7.3-4)."""
    base = VisitRequest(
        id=uuid4(),
        user_id=USER,
        route_id="R1",
        org_kind=OrgKind.KOREHA,
        status=VisitStatus.SENT,
        preferred_at_1=SOON,
        preferred_at_2=None,
    )
    assert not base.chat_available
    assert replace(base, status=VisitStatus.ACKNOWLEDGED).chat_available
    assert replace(base, status=VisitStatus.CONFIRMED).chat_available
    assert not replace(base, status=VisitStatus.COMPLETED).chat_available


# ── 요청 생성 ──


def test_request_goes_to_the_right_org() -> None:
    """항목이 기관을 정한다. 숙식은 공단, 신분증은 주민센터다."""
    usecase, _, _ = make_usecase()
    assert send(usecase, "R1").org_kind == OrgKind.KOREHA
    assert send(usecase, "R9").org_kind == OrgKind.CENTER


def test_route_without_org_is_refused() -> None:
    """통장(R10)은 은행, 증명서(R13)는 교정시설이라 받을 담당자가 없다.
    받아 두고 아무도 보지 않는 것이 가장 나쁘다."""
    usecase, _, _ = make_usecase()
    for route in ("R10", "R13", "R14"):
        with pytest.raises(VisitError) as err:
            send(usecase, route)
        assert err.value.code == "no_org"


def test_past_time_is_refused() -> None:
    usecase, _, _ = make_usecase()
    with pytest.raises(VisitError) as err:
        send(usecase, preferred_at_1=NOW - timedelta(hours=1))
    assert err.value.code == "past_time"


def test_same_route_twice_is_refused_with_the_existing_one() -> None:
    """**그냥 막지 않는다**(§7.5). 다시 보내는 이유는 대개 앞서 보낸 것이
    갔는지 모르기 때문이라, 기존 요청을 함께 돌려준다."""
    usecase, _, _ = make_usecase()
    first = send(usecase, "R1")

    with pytest.raises(VisitError) as err:
        send(usecase, "R1")
    assert err.value.code == "limit"
    assert err.value.verdict is not None
    assert err.value.verdict.kind == LimitKind.SAME_ROUTE
    assert [r.id for r in err.value.verdict.existing] == [first.id]


def test_cancelled_route_can_be_sent_again() -> None:
    """취소할 길이 없으면 상한이 벌칙이 된다. 무른 뒤에는 다시 보낼 수 있어야 한다."""
    usecase, _, _ = make_usecase()
    first = send(usecase, "R1")
    usecase.cancel(USER, first.id, NOW)
    again = send(usecase, "R1")
    assert again.status == VisitStatus.SENT


def test_cancel_refuses_someone_elses_request() -> None:
    usecase, _, _ = make_usecase()
    mine = send(usecase, "R1")
    with pytest.raises(VisitError) as err:
        usecase.cancel(uuid4(), mine.id, NOW)
    # 남의 요청인지 없는 요청인지 구분해 주지 않는다.
    assert err.value.code == "not_found"


# ── 담당자 쪽 ──


def test_confirm_without_place_is_refused() -> None:
    """**이 서비스의 약속이 여기 걸려 있다.** 시간만 정해지고 어디로 갈지 모르면
    창구에서 다시 물어야 하고, 그 순간이 없애려던 장벽이다."""
    usecase, _, _ = make_usecase()
    staff = make_staff()
    sent = send(usecase, "R1")
    usecase.act(
        staff,
        sent.id,
        VisitStatus.ACKNOWLEDGED,
        meeting_place="",
        confirmed_for=None,
        proposed_at=None,
        cancel_reason="",
        now=NOW,
    )

    with pytest.raises(VisitError) as err:
        usecase.act(
            staff,
            sent.id,
            VisitStatus.CONFIRMED,
            meeting_place="   ",
            confirmed_for=None,
            proposed_at=None,
            cancel_reason="",
            now=NOW,
        )
    assert err.value.code == "no_place"


def test_confirm_carries_staff_name_and_place() -> None:
    """확정 응답에 만날 사람과 장소가 함께 나간다. 하나만 있으면 의미가 없다."""
    usecase, _, _ = make_usecase()
    staff = make_staff()
    sent = send(usecase, "R1")
    usecase.act(
        staff,
        sent.id,
        VisitStatus.ACKNOWLEDGED,
        meeting_place="",
        confirmed_for=None,
        proposed_at=None,
        cancel_reason="",
        now=NOW,
    )
    confirmed = usecase.act(
        staff,
        sent.id,
        VisitStatus.CONFIRMED,
        meeting_place="경기지부 2층 상담실",
        confirmed_for=None,
        proposed_at=None,
        cancel_reason="",
        now=NOW,
    )
    assert confirmed.assigned_staff_name == "경기지부 담당자"
    assert confirmed.meeting_place == "경기지부 2층 상담실"
    assert confirmed.confirmed_at == NOW


def test_reschedule_needs_a_proposed_time() -> None:
    usecase, _, _ = make_usecase()
    staff = make_staff()
    sent = send(usecase, "R1")
    usecase.act(
        staff,
        sent.id,
        VisitStatus.ACKNOWLEDGED,
        meeting_place="",
        confirmed_for=None,
        proposed_at=None,
        cancel_reason="",
        now=NOW,
    )
    with pytest.raises(VisitError) as err:
        usecase.act(
            staff,
            sent.id,
            VisitStatus.RESCHEDULE_PROPOSED,
            meeting_place="",
            confirmed_for=None,
            proposed_at=None,
            cancel_reason="",
            now=NOW,
        )
    assert err.value.code == "no_time"


def test_other_org_cannot_touch_the_request() -> None:
    """주민센터 직원이 공단 요청을 열지도 바꾸지도 못한다(§8.2 접근 통제)."""
    usecase, _, _ = make_usecase()
    sent = send(usecase, "R1")  # 공단
    with pytest.raises(VisitError) as err:
        usecase.act(
            make_staff(OrgKind.CENTER),
            sent.id,
            VisitStatus.ACKNOWLEDGED,
            meeting_place="",
            confirmed_for=None,
            proposed_at=None,
            cancel_reason="",
            now=NOW,
        )
    assert err.value.code == "other_org"


def test_staff_inbox_shows_only_own_org() -> None:
    usecase, _, _ = make_usecase()
    send(usecase, "R1")  # 공단
    send(usecase, "R9")  # 주민센터

    koreha = usecase.staff_inbox(
        make_staff(OrgKind.KOREHA), branch_filter=False, open_only=True
    )
    assert [r.route_id for r in koreha] == ["R1"]


def test_every_staff_read_is_logged() -> None:
    """**사후에 추적할 수 없으면 통제가 아니다**(§8.2)."""
    usecase, _, log = make_usecase()
    staff = make_staff()
    sent = send(usecase, "R1")

    usecase.staff_inbox(staff, branch_filter=False, open_only=True)
    usecase.act(
        staff,
        sent.id,
        VisitStatus.ACKNOWLEDGED,
        meeting_place="",
        confirmed_for=None,
        proposed_at=None,
        cancel_reason="",
        now=NOW,
    )

    assert [action for _, action, _ in log.entries] == ["list", "update:acknowledged"]
    # 목록 열람은 대상이 특정되지 않고, 상태 변경은 그 사용자를 가리킨다.
    assert log.entries[0][2] is None
    assert log.entries[1][2] == USER


# ── 담당자에게 보내는 진단 답변 (기획서 §7.4) ──


ANSWERS = [
    {"route_id": "R14", "section": "기타·권리구제",
     "question": "빚 문제는 어떤 상황인가요?", "answer": "법원에 신청해 진행 중이에요"},
    {"route_id": "R9", "section": "신분·행정",
     "question": "신분증은 지금 어떤 상황인가요?", "answer": "잃어버려서 없어요"},
    {"route_id": "R11", "section": "주거",
     "question": "주민등록 주소는요?", "answer": "말소됐어요"},
]


def test_answers_need_consent() -> None:
    """**동의 없이 받지 않는다.**

    §3.4의 제공 동의는 항목을 "성명, 방문 희망 일시, 방문 목적"으로 적고 있어
    진단 답변은 범위 밖이다. 받아 두고 나중에 동의를 받는 순서는 성립하지 않는다.
    """
    usecase, _, _ = make_usecase()
    with pytest.raises(VisitError) as err:
        send(usecase, "R9", shared_answers=ANSWERS, share_consented=False)
    assert err.value.code == "no_share_consent"


def test_consented_answers_are_kept_with_the_visit() -> None:
    """**상시 저장이 아니라 그 요청에만 붙는다.** 보관 기간도 요청을 따라간다(§9.5)."""
    usecase, _, _ = make_usecase()
    created = send(usecase, "R9", shared_answers=ANSWERS, share_consented=True)
    assert len(created.shared_answers) == 3
    assert created.shared_answers_consented_at == NOW


def test_no_answers_means_no_consent_record() -> None:
    """보내지 않았으면 동의 기록도 남지 않는다 — 동의만 있고 내용이 없는 행을
    만들지 않는다."""
    usecase, _, _ = make_usecase()
    created = send(usecase, "R9", share_consented=True)
    assert created.shared_answers == ()
    assert created.shared_answers_consented_at is None


def test_answers_are_sorted_by_relevance_to_the_visit() -> None:
    """**담당자는 위에서부터 읽는다**(§7.4).

    주민센터에 신분증 때문에 가는 사람의 답 중 신분 관련이 맨 아래 있으면,
    그 방문에 필요한 것을 가장 늦게 본다.
    """
    from app.domains.visit.adapter.inbound.api.router import _sorted_answers

    usecase, _, _ = make_usecase()
    created = send(usecase, "R9", shared_answers=ANSWERS, share_consented=True)
    order = [a.route_id for a in _sorted_answers(created)]

    assert order[0] == "R9", "그 방문의 항목이 맨 위여야 한다"
    # R11도 주민센터 일이라 R14(법원)보다 앞에 온다.
    assert order.index("R11") < order.index("R14")


# ── 만나기로 한 시각 (기획서 §7.1) ──


def _confirm(usecase, visit, staff, **kwargs):  # type: ignore[no-untyped-def]
    usecase.act(
        staff, visit.id, VisitStatus.ACKNOWLEDGED,
        meeting_place="", confirmed_for=None, proposed_at=None,
        cancel_reason="", now=NOW,
    )
    params = {
        "meeting_place": "2층 상담실",
        "confirmed_for": None,
        "proposed_at": None,
        "cancel_reason": "",
        "now": NOW,
    }
    params.update(kwargs)
    return usecase.act(staff, visit.id, VisitStatus.CONFIRMED, **params)


def test_confirmed_time_defaults_to_the_first_choice() -> None:
    """**안 보내면 1지망으로 채운다.**

    대부분 1지망으로 확정되고, 매번 입력하게 하면 빼먹었을 때 확정 자체가 막힌다.
    장소를 필수로 둔 것과 다른 판단인데, 장소는 서버가 알 수 없는 정보이고
    시각은 이미 1지망이 있기 때문이다.
    """
    usecase, _, _ = make_usecase()
    sent = send(usecase, "R1")
    confirmed = _confirm(usecase, sent, make_staff())
    assert confirmed.confirmed_for == SOON


def test_confirmed_time_can_differ_from_both_choices() -> None:
    """**담당자가 조율한 시간으로 확정할 수 있다.**

    1·2지망 중에서만 고르게 하면 전화로 조율한 결과를 담을 자리가 없다.
    """
    usecase, _, _ = make_usecase()
    sent = send(usecase, "R1")
    other = SOON + timedelta(days=3)
    confirmed = _confirm(usecase, sent, make_staff(), confirmed_for=other)
    assert confirmed.confirmed_for == other


def test_confirmed_at_is_not_the_meeting_time() -> None:
    """**둘을 섞으면 새벽에 만나자는 안내가 나간다.**

    화면이 confirmed_at을 만나는 시각으로 쓰다가 "8월 24일 오전으로 정해졌어요"가
    나온 적이 있다. 확정을 누른 시각이 15:10Z, 곧 한국 시각 자정 10분이었다.
    """
    usecase, _, _ = make_usecase()
    sent = send(usecase, "R1")
    confirmed = _confirm(usecase, sent, make_staff())
    assert confirmed.confirmed_at == NOW
    assert confirmed.confirmed_for == SOON
    assert confirmed.confirmed_at != confirmed.confirmed_for
