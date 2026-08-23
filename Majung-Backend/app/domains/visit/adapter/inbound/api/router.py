"""방문 요청 — 출소자 쪽과 담당자 쪽 인바운드 어댑터 (기획서 §7).

**확정 응답의 내용이 이 기능의 핵심이다.** 만날 사람의 이름과 장소가 반드시 함께
나가야 한다. "창구에서 신분이 드러나는 순간이 실질적 장벽"이라는 인터뷰 결과의
해법은 시간을 예약하는 것이 아니라 누구를 찾아가면 되는지 미리 아는 것이다.

규칙은 유스케이스가 들고 있고 여기서는 HTTP로만 옮긴다.
"""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.domains.account.adapter.inbound.api.deps import require_account
from app.domains.account.domain.entity import Account
from app.domains.shared.routes import RouteId
from app.domains.staff.adapter.inbound.api.deps import require_staff
from app.domains.staff.domain.entity import Staff, org_for
from app.domains.visit.application.usecase import VisitError, VisitUseCase
from app.domains.visit.domain.entity import SharedAnswer, VisitRequest, VisitStatus
from app.infrastructure.config.settings import get_settings

router = APIRouter(prefix="/api", tags=["visit"])

CurrentAccount = Annotated[Account, Depends(require_account)]
CurrentStaff = Annotated[Staff, Depends(require_staff)]

_MAX_NOTE = 500
_MAX_DOCS = 20
# 분야 여섯에 항목 열넷이라 그보다 많이 올 이유가 없다.
_MAX_SHARED = 20

# 거절 사유를 상태 코드로. 표에 없으면 400이다.
_STATUS: dict[str, int] = {
    "limit": 409,
    "bad_transition": 409,
    "not_found": 404,
    "other_org": 403,
    "no_share_consent": 403,
}


def _usecase(request: Request) -> VisitUseCase:
    usecase = getattr(request.app.state, "visit_usecase", None)
    if not isinstance(usecase, VisitUseCase):
        raise HTTPException(
            status_code=503, detail="지금은 이용할 수 없어요. 잠시 후 다시 시도해 주세요."
        )
    return usecase


class SharedAnswerIn(BaseModel):
    """담당자에게 보낼 진단 답 한 줄(§7.4).

    **문항 id가 아니라 사람이 읽는 문장으로 받는다.** 문항 문구는 화면이 정본으로
    들고 있어서, 서버가 그것을 알면 같은 정의가 두 군데 있게 된다.
    """

    route_id: str = Field(min_length=2, max_length=4)
    section: str = Field(max_length=40)
    question: str = Field(min_length=1, max_length=200)
    answer: str = Field(min_length=1, max_length=300)


class SharedAnswerOut(BaseModel):
    route_id: str
    section: str
    question: str
    answer: str


class VisitCreateIn(BaseModel):
    route_id: str = Field(min_length=2, max_length=4)
    preferred_at_1: datetime
    # 1지망이 안 될 때 조율 왕복이 한 번 줄어든다(§7.2).
    preferred_at_2: datetime | None = None
    # 담당자가 미리 알면 헛걸음을 막는다.
    prepared_docs: list[str] = Field(default_factory=list, max_length=_MAX_DOCS)
    # 미리 말해 두고 싶은 것이 있는 사람을 위한 자리다. 선택 사항이다.
    note: str = Field(default="", max_length=_MAX_NOTE)
    # 담당자가 미리 보면 더 자세히 안내할 수 있다(§7.4). **동의가 있어야 받는다.**
    shared_answers: list[SharedAnswerIn] = Field(
        default_factory=list, max_length=_MAX_SHARED
    )
    share_consented: bool = False


class VisitOut(BaseModel):
    id: str
    route_id: str
    status: str
    preferred_at_1: datetime
    preferred_at_2: datetime | None
    prepared_docs: list[str]
    note: str
    # 확정되면 이 둘이 함께 채워진다. **하나만 있으면 의미가 없다.**
    staff_name: str
    meeting_place: str
    confirmed_at: datetime | None
    proposed_at: datetime | None
    cancel_reason: str
    # 담당자가 확인하기 전에는 채팅을 열지 않는다(§7.3-4).
    chat_available: bool
    # 하루 상한(§7.5)을 화면이 미리 셀 수 있게 함께 보낸다.
    #
    # **판정은 서버가 한다.** 다만 이 값이 없으면 화면은 앱을 다시 켤 때마다
    # 셈이 0으로 돌아가, 사용자가 보내고 나서야 막혔다는 것을 알게 된다.
    created_at: datetime | None


class LimitOut(BaseModel):
    """상한에 닿았을 때의 응답. **그냥 막지 않고 기존 요청을 함께 보여 준다**(§7.5).
    사용자가 다시 보내는 이유는 대개 앞서 보낸 것이 제대로 갔는지 모르기 때문이다."""

    kind: str
    message: str
    existing: list[VisitOut]


def _to_out(r: VisitRequest) -> VisitOut:
    return VisitOut(
        id=str(r.id),
        route_id=r.route_id,
        status=r.status.value,
        preferred_at_1=r.preferred_at_1,
        preferred_at_2=r.preferred_at_2,
        prepared_docs=list(r.prepared_docs),
        note=r.note,
        staff_name=r.assigned_staff_name,
        meeting_place=r.meeting_place,
        confirmed_at=r.confirmed_at,
        proposed_at=r.proposed_at,
        cancel_reason=r.cancel_reason,
        chat_available=r.chat_available,
        created_at=r.created_at,
    )


def _fail(err: VisitError) -> HTTPException:
    status = _STATUS.get(err.code, 400)
    if err.verdict is not None:
        # 상한 거절만 본문이 다르다 — 기존 요청을 함께 실어 보낸다.
        detail = LimitOut(
            kind=err.verdict.kind.value if err.verdict.kind else "",
            message=err.message,
            existing=[_to_out(r) for r in err.verdict.existing],
        ).model_dump(mode="json")
        return HTTPException(status_code=status, detail=detail)
    return HTTPException(status_code=status, detail=err.message)


# ── 출소자 쪽 ──


@router.post("/visits", response_model=VisitOut)
def create_visit(
    body: VisitCreateIn, request: Request, account: CurrentAccount
) -> VisitOut:
    try:
        created = _usecase(request).request_visit(
            user_id=account.id,
            route_id=body.route_id,
            preferred_at_1=body.preferred_at_1,
            preferred_at_2=body.preferred_at_2,
            prepared_docs=body.prepared_docs,
            note=body.note.strip(),
            now=datetime.now(UTC),
            shared_answers=[a.model_dump() for a in body.shared_answers],
            share_consented=body.share_consented,
        )
    except VisitError as err:
        raise _fail(err) from None
    return _to_out(created)


@router.get("/visits", response_model=list[VisitOut])
def list_my_visits(request: Request, account: CurrentAccount) -> list[VisitOut]:
    return [_to_out(r) for r in _usecase(request).my_visits(account.id)]


@router.post("/visits/{request_id}/cancel", response_model=VisitOut)
def cancel_visit(
    request_id: UUID, request: Request, account: CurrentAccount
) -> VisitOut:
    try:
        updated = _usecase(request).cancel(account.id, request_id, datetime.now(UTC))
    except VisitError as err:
        raise _fail(err) from None
    return _to_out(updated)


# ── 담당자 쪽 ──


class StaffVisitOut(BaseModel):
    """담당자가 보는 요청. **최소 노출 원칙을 적용한다**(§7.4).

    죄목과 생년월일은 담지 않는다. 응대에 필요하지 않기 때문이다. 이름은 창구에서
    본인을 확인하는 데 쓰이므로 보낸다.
    """

    id: str
    route_id: str
    status: str
    user_name: str
    preferred_at_1: datetime
    preferred_at_2: datetime | None
    prepared_docs: list[str]
    note: str
    meeting_place: str
    created_at: datetime | None
    # 사용자가 동의하고 보낸 진단 답변(§7.4). 동의가 없으면 빈 목록이다.
    shared_answers: list[SharedAnswerOut] = []


class StaffActionIn(BaseModel):
    status: str
    # 확정할 때 반드시 함께 온다. 장소가 없으면 확정이 성립하지 않는다.
    meeting_place: str = Field(default="", max_length=100)
    proposed_at: datetime | None = None
    cancel_reason: str = Field(default="", max_length=200)


def _staff_out(r: VisitRequest, user_name: str) -> StaffVisitOut:
    return StaffVisitOut(
        id=str(r.id),
        route_id=r.route_id,
        status=r.status.value,
        user_name=user_name,
        preferred_at_1=r.preferred_at_1,
        preferred_at_2=r.preferred_at_2,
        prepared_docs=list(r.prepared_docs),
        note=r.note,
        meeting_place=r.meeting_place,
        created_at=r.created_at,
        shared_answers=[
            SharedAnswerOut(
                route_id=a.route_id,
                section=a.section,
                question=a.question,
                answer=a.answer,
            )
            for a in _sorted_answers(r)
        ],
    )


def _sorted_answers(r: VisitRequest) -> list[SharedAnswer]:
    """방문 목적에 가까운 답이 위로 온다(§7.4).

    **담당자는 위에서부터 읽는다.** 주민등록 재발급하러 온 사람의 답 중에 신분
    관련이 맨 아래 있으면 그 방문에 필요한 것을 가장 늦게 본다.

    1순위  그 방문의 항목
    2순위  같은 기관에서 처리하는 항목
    3순위  나머지
    """
    same_org = {
        route.value
        for route in RouteId
        if org_for(route) == r.org_kind
    }

    def rank(a: SharedAnswer) -> tuple[int, str]:
        if a.route_id == r.route_id:
            return (0, a.route_id)
        if a.route_id in same_org:
            return (1, a.route_id)
        return (2, a.route_id)

    return sorted(r.shared_answers, key=rank)


def _name_of(request: Request, user_id: UUID) -> str:
    """본인 확인용 이름만 꺼낸다. **죄목 저장소는 여기서 아예 부르지 않는다.**"""
    accounts = getattr(request.app.state, "account_repo", None)
    if accounts is None:
        return ""
    account = accounts.by_id(user_id)
    return account.name if isinstance(account, Account) else ""


@router.get("/staff/visits", response_model=list[StaffVisitOut])
def list_staff_visits(
    request: Request, staff: CurrentStaff, open_only: bool = True
) -> list[StaffVisitOut]:
    """자기 기관으로 온 요청 목록.

    지부 필터는 설정으로 켜고 끈다(§8.2). 해커톤 단계에서는 어느 지부로 보냈든 한
    화면에서 받아야 시연이 되므로 꺼 둔다.
    """
    found = _usecase(request).staff_inbox(
        staff,
        branch_filter=get_settings().staff_branch_filter,
        open_only=open_only,
    )
    return [_staff_out(r, _name_of(request, r.user_id)) for r in found]


@router.patch("/staff/visits/{request_id}", response_model=StaffVisitOut)
def act_on_visit(
    request_id: UUID,
    body: StaffActionIn,
    request: Request,
    staff: CurrentStaff,
) -> StaffVisitOut:
    """상태를 바꾼다. **표에 없는 전이는 막는다.** "완료된 요청이 다시 확정으로"
    같은 일이 조용히 일어나면 안 된다."""
    try:
        target = VisitStatus(body.status)
    except ValueError:
        raise HTTPException(status_code=400, detail="상태 값이 올바르지 않아요.") from None

    try:
        updated = _usecase(request).act(
            staff,
            request_id,
            target,
            meeting_place=body.meeting_place,
            proposed_at=body.proposed_at,
            cancel_reason=body.cancel_reason,
            now=datetime.now(UTC),
        )
    except VisitError as err:
        raise _fail(err) from None
    return _staff_out(updated, _name_of(request, updated.user_id))
