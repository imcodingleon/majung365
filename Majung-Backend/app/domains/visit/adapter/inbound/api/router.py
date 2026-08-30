"""방문 요청 — 출소자 쪽과 담당자 쪽 인바운드 어댑터 (기획서 §7).

**확정 응답의 내용이 이 기능의 핵심이다.** 만날 사람의 이름과 장소가 반드시 함께
나가야 한다. "창구에서 신분이 드러나는 순간이 실질적 장벽"이라는 인터뷰 결과의
해법은 시간을 예약하는 것이 아니라 누구를 찾아가면 되는지 미리 아는 것이다.

규칙은 유스케이스가 들고 있고 여기서는 HTTP로만 옮긴다.
"""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.domains.account.adapter.inbound.api.deps import require_account
from app.domains.account.domain.entity import Account
from app.domains.shared.routes import RouteId
from app.domains.staff.adapter.inbound.api.deps import require_staff
from app.domains.staff.domain.entity import Staff, org_for
from app.domains.visit.application.chat_usecase import RoomGlance, VisitChatUseCase
from app.domains.visit.application.summary_usecase import VisitSummaryUseCase
from app.domains.visit.application.usecase import VisitError, VisitUseCase
from app.domains.visit.domain.entity import SharedAnswer, VisitRequest, VisitStatus
from app.domains.visit.domain.message import SenderRole
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


def _summary(request: Request) -> VisitSummaryUseCase | None:
    """요약 유스케이스. **없으면 막지 않고 `None`을 돌려준다.**

    요약은 곁들이는 것이라, 만들 수 없다고 방문 요청까지 거절할 이유가 없다.
    담당자는 요약이 없어도 답변 원문을 그대로 본다.
    """
    usecase = getattr(request.app.state, "visit_summary_usecase", None)
    return usecase if isinstance(usecase, VisitSummaryUseCase) else None


def _chat(request: Request) -> VisitChatUseCase | None:
    """채팅 유스케이스. **없으면 막지 않고 `None`을 돌려준다.**

    안 읽은 개수는 곁들이는 값이라, 채팅이 꺼져 있다고 방문 요청 목록까지 못 볼 이유가
    없다. 없으면 0으로 나간다.
    """
    usecase = getattr(request.app.state, "visit_chat_usecase", None)
    return usecase if isinstance(usecase, VisitChatUseCase) else None


_NO_GLANCE = RoomGlance(unread=0, preview="", at=None)


def _glance(
    chat: VisitChatUseCase | None, r: VisitRequest, role: SenderRole
) -> RoomGlance:
    """목록 한 줄에 얹을 것. 방이 열리지 않았으면 볼 것이 없다.

    **닫힌 방을 먼저 걸러 낸다.** 이 함수는 요청 하나마다 대화를 통째로 읽으므로,
    목록에 있는 요청 수만큼 조회가 나간다. 대기 상한이 다섯(§7.5)이라 실제로는 몇
    번에 그치지만, 이미 끝났거나 취소된 요청까지 세면 그 수가 계속 늘어난다.
    """
    if chat is None or not r.chat_available:
        return _NO_GLANCE
    return chat.glance_for(r, role)


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
    # 확정 처리를 누른 시각. **만나기로 한 시각이 아니다** — 화면에 쓰지 않는다.
    confirmed_at: datetime | None
    # 만나기로 한 시각(§7.1). 확정 문구가 쓸 값이다.
    confirmed_for: datetime | None
    proposed_at: datetime | None
    cancel_reason: str
    # 담당자가 확인하기 전에는 채팅을 열지 않는다(§7.3-4).
    chat_available: bool
    # 하루 상한(§7.5)을 화면이 미리 셀 수 있게 함께 보낸다.
    #
    # **판정은 서버가 한다.** 다만 이 값이 없으면 화면은 앱을 다시 켤 때마다
    # 셈이 0으로 돌아가, 사용자가 보내고 나서야 막혔다는 것을 알게 된다.
    created_at: datetime | None
    # 담당자가 보냈는데 아직 안 읽은 메시지 수.
    #
    # **화면이 셀 수 없는 값이다.** 대화 내용은 소켓으로 방에 들어가야 오는데, 목록의
    # 숫자를 그리자고 방마다 붙을 수는 없다. 그래서 서버가 세어 함께 보낸다.
    unread: int = 0
    # 마지막으로 오간 말 한 줄. 같은 이유로 서버가 실어 보낸다.
    #
    # 이것이 없으면 상담 탭이 제목만 늘어선 표가 된다 — 어제 어디까지 이야기했는지
    # 열어보기 전에는 알 수 없다.
    last_message: str = ""
    last_message_at: datetime | None = None


class LimitOut(BaseModel):
    """상한에 닿았을 때의 응답. **그냥 막지 않고 기존 요청을 함께 보여 준다**(§7.5).
    사용자가 다시 보내는 이유는 대개 앞서 보낸 것이 제대로 갔는지 모르기 때문이다."""

    kind: str
    message: str
    existing: list[VisitOut]


def _to_out(r: VisitRequest, glance: RoomGlance = _NO_GLANCE) -> VisitOut:
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
        confirmed_for=r.confirmed_for,
        proposed_at=r.proposed_at,
        cancel_reason=r.cancel_reason,
        chat_available=r.chat_available,
        created_at=r.created_at,
        unread=glance.unread,
        last_message=glance.preview,
        last_message_at=glance.at,
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
    body: VisitCreateIn,
    request: Request,
    account: CurrentAccount,
    background: BackgroundTasks,
) -> VisitOut:
    now = datetime.now(UTC)
    try:
        created = _usecase(request).request_visit(
            user_id=account.id,
            route_id=body.route_id,
            preferred_at_1=body.preferred_at_1,
            preferred_at_2=body.preferred_at_2,
            prepared_docs=body.prepared_docs,
            note=body.note.strip(),
            now=now,
            shared_answers=[a.model_dump() for a in body.shared_answers],
            share_consented=body.share_consented,
        )
    except VisitError as err:
        raise _fail(err) from None
    _queue_summary(request, background, created, now)
    return _to_out(created)


def _queue_summary(
    request: Request,
    background: BackgroundTasks,
    created: VisitRequest,
    now: datetime,
) -> None:
    """담당자가 먼저 읽을 요약을 뒤에서 만든다 (§7.4).

    **응답을 붙잡아 두지 않는다.** 담당자 쪽은 목록을 다시 불러 보는 구조라 몇 초
    늦게 채워져도 문제가 없는데, 여기서 기다리면 보내는 사람이 그만큼 멈춰 선다.

    지출 상한에 걸리면 요약만 건너뛴다 — **429를 내지 않는다.** 사용자가 보낸 것은
    요약이 아니라 방문 요청이고, 그것은 이미 저장됐다. 다만 그때도 상태는 정리한다.
    pending으로 두고 떠나면 담당자 화면이 오지 않을 요약을 계속 기다린다.
    """
    summary = _summary(request)
    if summary is None or not created.shared_answers:
        return
    spend = getattr(request.app.state, "spend", None)
    if spend is not None and not spend.check():
        summary.skip(created.id, now=now)
        return
    background.add_task(summary.generate, created.id, now=now)


@router.get("/visits", response_model=list[VisitOut])
def list_my_visits(request: Request, account: CurrentAccount) -> list[VisitOut]:
    chat = _chat(request)
    return [
        _to_out(r, _glance(chat, r, SenderRole.USER))
        for r in _usecase(request).my_visits(account.id)
    ]


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
    confirmed_for: datetime | None
    created_at: datetime | None
    # 출소자가 보냈는데 담당자가 아직 안 읽은 메시지 수.
    #
    # **역할을 바꿔 넣지 않는다.** 출소자 쪽 응답과 세는 기준이 반대여서, 뒤집으면
    # 자기가 보낸 것을 안 읽은 것으로 세게 된다.
    unread: int = 0
    # 마지막으로 오간 말. 출소자 쪽 응답과 같은 값이다 — 한쪽만 두면 또 짝이 어긋난다.
    last_message: str = ""
    last_message_at: datetime | None = None
    # 사용자가 동의하고 보낸 진단 답변(§7.4). 동의가 없으면 빈 목록이다.
    shared_answers: list[SharedAnswerOut] = []
    # 담당자가 먼저 읽는 요약(§7.4). **원문을 대체하지 않는다** — 화면은 요약을
    # 위에 놓고, 답변 원문은 버튼을 눌러 펼쳐 보게 한다.
    summary: str = ""
    # none: 만들 것이 없다 / pending: 만드는 중 / ready: 있다 / failed: 못 만들었다
    #
    # **없는 것과 못 만든 것을 구분해 보낸다.** 화면이 둘을 같게 다루면, 답변을
    # 보내지 않은 요청에도 "요약을 만들지 못했습니다"가 뜬다.
    summary_status: str = "none"


class StaffActionIn(BaseModel):
    status: str
    # 확정할 때 반드시 함께 온다. 장소가 없으면 확정이 성립하지 않는다.
    meeting_place: str = Field(default="", max_length=100)
    # 만나기로 한 시각. 안 보내면 서버가 출소자가 오겠다는 때로 채운다 (§7.3).
    confirmed_for: datetime | None = None
    proposed_at: datetime | None = None
    cancel_reason: str = Field(default="", max_length=200)


def _staff_out(
    r: VisitRequest, user_name: str, glance: RoomGlance = _NO_GLANCE
) -> StaffVisitOut:
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
        confirmed_for=r.confirmed_for,
        created_at=r.created_at,
        unread=glance.unread,
        last_message=glance.preview,
        last_message_at=glance.at,
        summary=r.summary,
        summary_status=r.summary_status.value,
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
    chat = _chat(request)
    return [
        _staff_out(r, _name_of(request, r.user_id), _glance(chat, r, SenderRole.STAFF))
        for r in found
    ]


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
            confirmed_for=body.confirmed_for,
            proposed_at=body.proposed_at,
            cancel_reason=body.cancel_reason,
            now=datetime.now(UTC),
        )
    except VisitError as err:
        raise _fail(err) from None
    return _staff_out(updated, _name_of(request, updated.user_id))
