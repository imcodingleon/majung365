"""방문 요청 유스케이스 (Application) — 기획서 §7.

규칙을 여기 모은다. **어댑터에 흩어지면 검증할 수 없다** — 상한 판정과 상태 전이는
HTTP 없이도 테스트할 수 있어야 하고, 나중에 관리자 화면이 다른 경로로 붙어도 같은
규칙을 지나야 한다.

거절은 예외 하나로 통일하고, 어댑터가 그 코드를 HTTP 상태로 옮긴다.
"""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from app.domains.shared.clock import to_kst_date
from app.domains.shared.routes import RouteId
from app.domains.staff.domain.entity import Staff, org_for
from app.domains.visit.domain.entity import VisitRequest, VisitStatus, can_move
from app.domains.visit.domain.limits import LimitVerdict
from app.domains.visit.domain.limits import check as check_limits
from app.domains.visit.domain.repository import VisitRepository


@dataclass
class VisitError(Exception):
    """거절 사유. code는 어댑터가 상태 코드로 옮기는 값이고,
    message는 그대로 사용자에게 보이는 문구다."""

    code: str
    message: str
    verdict: LimitVerdict | None = None


@dataclass
class VisitUseCase:
    visits: VisitRepository
    # 담당자가 목록을 열 때마다 남긴다. 없으면 기록 없이 진행한다 —
    # 로그 테이블 장애가 곧 서비스 중단이 되지는 않게 한다(§8.2 주석 참고).
    access_log: object | None = None

    # ── 출소자 쪽 ──

    def request_visit(
        self,
        *,
        user_id: UUID,
        route_id: str,
        preferred_at_1: datetime,
        preferred_at_2: datetime | None,
        prepared_docs: list[str],
        note: str,
        now: datetime,
        shared_answers: list[dict[str, str]] | None = None,
        share_consented: bool = False,
    ) -> VisitRequest:
        try:
            route = RouteId(route_id)
        except ValueError:
            raise VisitError("bad_route", "지원 항목을 다시 확인해 주세요.") from None

        org = org_for(route)
        if org is None:
            # R10 통장은 은행, R13은 교정시설, R14는 법원이라 받을 담당자가 없다.
            raise VisitError(
                "no_org", "이 항목은 방문 예약 대신 안내된 창구로 바로 가시면 돼요."
            )

        if preferred_at_1 <= now:
            raise VisitError("past_time", "지난 시간은 고를 수 없어요.")
        if preferred_at_2 is not None and preferred_at_2 == preferred_at_1:
            raise VisitError("same_time", "1지망과 2지망을 다르게 골라 주세요.")

        # **상한은 서버가 센다**(§7.5). 기기에서 세는 값은 우회된다.
        verdict = check_limits(self.visits.by_user(user_id), route_id, to_kst_date(now))
        if not verdict.allowed:
            raise VisitError("limit", verdict.message, verdict)

        if shared_answers and not share_consented:
            # **동의 없이 받지 않는다.** §3.4의 제공 동의는 항목을 "성명, 방문
            # 희망 일시, 방문 목적"으로 적고 있어 진단 답변은 범위 밖이다.
            # 받아 두고 나중에 동의를 받는 순서는 성립하지 않는다.
            raise VisitError(
                "no_share_consent", "답변을 함께 보내려면 먼저 동의가 필요해요."
            )

        return self.visits.create(
            user_id=user_id,
            route_id=route_id,
            org_kind=org,
            preferred_at_1=preferred_at_1,
            preferred_at_2=preferred_at_2,
            prepared_docs=prepared_docs,
            note=note,
            shared_answers=shared_answers,
            consented_at=now if shared_answers and share_consented else None,
        )

    def my_visits(self, user_id: UUID) -> list[VisitRequest]:
        return self.visits.by_user(user_id)

    def cancel(self, user_id: UUID, request_id: UUID, now: datetime) -> VisitRequest:
        """사용자가 스스로 무른다. **취소할 길이 없으면 상한이 벌칙이 된다** —
        잘못 보낸 요청 하나 때문에 그 항목을 다시 신청하지 못하게 두지 않는다."""
        current = self.visits.by_id(request_id)
        if current is None or current.user_id != user_id:
            # 남의 요청인지 없는 요청인지 구분해 주지 않는다.
            raise VisitError("not_found", "요청을 찾을 수 없어요.")
        if not can_move(current.status, VisitStatus.CANCELLED):
            raise VisitError("bad_transition", "지금은 취소할 수 없어요.")
        self.visits.update_status(request_id, VisitStatus.CANCELLED, now=now)
        updated = self.visits.by_id(request_id)
        assert updated is not None
        return updated

    # ── 담당자 쪽 ──

    def staff_inbox(
        self, staff: Staff, *, branch_filter: bool, open_only: bool
    ) -> list[VisitRequest]:
        branch = staff.branch if branch_filter else None
        found = self.visits.for_staff(staff.org_kind, branch, open_only)
        self._log(staff.id, "list", None)
        return found

    def act(
        self,
        staff: Staff,
        request_id: UUID,
        target: VisitStatus,
        *,
        meeting_place: str,
        confirmed_for: datetime | None,
        proposed_at: datetime | None,
        cancel_reason: str,
        now: datetime,
    ) -> VisitRequest:
        current = self.visits.by_id(request_id)
        if current is None:
            raise VisitError("not_found", "요청을 찾을 수 없어요.")
        if current.org_kind != staff.org_kind:
            # 남의 기관 요청은 열지도 바꾸지도 못한다.
            raise VisitError("other_org", "다른 기관의 요청이에요.")
        if not can_move(current.status, target):
            raise VisitError("bad_transition", "지금 상태에서는 바꿀 수 없어요.")

        if target == VisitStatus.CONFIRMED and not meeting_place.strip():
            # **장소 없는 확정은 받지 않는다.** 시간만 정해지고 어디로 갈지 모르면
            # 창구에서 다시 물어야 하고, 그 순간이 이 서비스가 없애려는 장벽이다.
            raise VisitError("no_place", "어디로 오면 되는지 함께 알려 주세요.")
        if target == VisitStatus.CONFIRMED and confirmed_for is None:
            # **안 보내면 채운다.** 담당자 화면은 2026-08-26부터 만날 때를 함께
            # 보내지만, 안 보내는 경로가 남아 있어도 확정 자체가 막히면 안 된다.
            # 장소를 필수로 둔 것과 다른 판단인데, 장소는 서버가 알 수 없는
            # 정보이고 시각은 이미 있다.
            #
            # **다만 조율 중이었다면 출소자가 적어낸 때가 아니다.** 그 상태에 이른
            # 이유가 바로 그 때가 안 된다는 것이라, 거절된 시각으로 확정되고도
            # 오류가 나지 않았다. 담당자 화면에는 확정으로 보이고 사용자는 안 되는
            # 시각을 안내받는다.
            confirmed_for = (
                current.proposed_at
                if current.status is VisitStatus.RESCHEDULE_PROPOSED
                and current.proposed_at is not None
                else current.preferred_at_1
            )
        if target == VisitStatus.RESCHEDULE_PROPOSED and proposed_at is None:
            raise VisitError("no_time", "제안할 시간을 함께 보내 주세요.")

        self.visits.update_status(
            request_id,
            target,
            staff_id=staff.id,
            meeting_place=meeting_place.strip() or None,
            confirmed_for=confirmed_for,
            proposed_at=proposed_at,
            cancel_reason=cancel_reason.strip() or None,
            now=now,
        )
        self._log(staff.id, f"update:{target.value}", current.user_id)

        updated = self.visits.by_id(request_id)
        assert updated is not None
        return updated

    def _log(self, staff_id: UUID, action: str, target_user_id: UUID | None) -> None:
        if self.access_log is None:
            return
        record = getattr(self.access_log, "record", None)
        if callable(record):
            record(staff_id, action, target_user_id)
