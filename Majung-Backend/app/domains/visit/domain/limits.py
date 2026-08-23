"""방문 요청 상한 — 순수 Python (Domain).

기획서 §7.5. 진입 게이트를 없애면서(§2.3) 허위 알림으로 담당자 업무를 방해하는
것이 실질 위험이 되었다.

**진짜 위험은 담당자가 못 받는 것이 아니라 진짜 요청이 묻히는 것이다.** 승인
단계가 있어 허위 요청의 실피해는 제한적이지만, 알림이 쏟아지면 급한 사람의 요청이
목록 아래로 밀린다.

**여기서도 그냥 막지 않는다.** 상한에 닿으면 이유와 함께 기존 요청을 보여준다 —
사용자가 다시 보내는 이유는 대개 앞서 보낸 것이 갔는지 모르기 때문이다.
"""

from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from app.domains.visit.domain.entity import VisitRequest

# 정상 사용자가 하루에 방문 예약을 셋 넘게 잡을 일이 드물다. 넘치면 다음 날 이어서 보낸다.
MAX_PER_DAY = 3
# **실질 방어선이다.** 담당자가 아직 확인하지 않은 요청이 다섯 쌓이면 새 요청을 받지 않는다.
MAX_OPEN = 5
# 확정되지 않은 요청이 이미 있으면 새로 보내지 못하고 기존 것을 고치게 한다.
MAX_OPEN_PER_ROUTE = 1


class LimitKind(StrEnum):
    DAILY = "daily"
    OPEN = "open"
    SAME_ROUTE = "same_route"


@dataclass(frozen=True)
class LimitVerdict:
    """상한 판정. 막을 때는 **왜 막는지와 무엇이 이미 있는지**를 함께 돌려준다."""

    allowed: bool
    kind: LimitKind | None = None
    message: str = ""
    # 이미 보낸 요청들. 화면이 이것을 보여줘 "갔는지 모르겠다"를 해소한다.
    existing: tuple[VisitRequest, ...] = ()


def check(
    requests: list[VisitRequest],
    route_id: str,
    today: date,
) -> LimitVerdict:
    """새 요청을 받아도 되는지 본다.

    **서버가 판정한다.** 기기에서 세는 값은 우회되므로, 프론트의 같은 검사는
    보내기 전에 미리 알려주는 용도이지 방어가 아니다.
    """
    same_route = [r for r in requests if r.route_id == route_id and r.is_open]
    if len(same_route) >= MAX_OPEN_PER_ROUTE:
        return LimitVerdict(
            allowed=False,
            kind=LimitKind.SAME_ROUTE,
            message="이미 보낸 요청이 있어요. 답을 기다리는 중이에요.",
            existing=tuple(same_route),
        )

    open_requests = [r for r in requests if r.is_open]
    if len(open_requests) >= MAX_OPEN:
        return LimitVerdict(
            allowed=False,
            kind=LimitKind.OPEN,
            message="답을 기다리는 요청이 여러 개 있어요. 먼저 답이 오면 다시 보낼 수 있어요.",
            existing=tuple(open_requests),
        )

    # 하루 상한은 결론이 난 것도 센다 — 취소를 반복해 빠져나가지 못하게 한다.
    today_count = sum(1 for r in requests if _sent_on(r, today))
    if today_count >= MAX_PER_DAY:
        return LimitVerdict(
            allowed=False,
            kind=LimitKind.DAILY,
            message="오늘은 요청을 다 보냈어요. 내일 이어서 보낼 수 있어요.",
            existing=tuple(r for r in requests if _sent_on(r, today)),
        )

    return LimitVerdict(allowed=True)


def _sent_on(request: VisitRequest, day: date) -> bool:
    """그날 보낸 요청인가. created_at이 없으면(아직 저장 전) 세지 않는다."""
    return request.created_at is not None and request.created_at.date() == day
