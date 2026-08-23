"""POST /api/staff/login · /logout · GET /api/staff/me — 담당자 인바운드 어댑터.

기획서 §8.2. **해커톤 단계에서는 계정을 우리가 발급한다** — 가입 엔드포인트가
없는 것이 의도다. 관리자 앱은 정의상 출소자 명단을 만들기 때문에, 스스로 계정을
만드는 길을 열면 그게 곧 구멍이 된다.
"""

import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.domains.staff.adapter.inbound.api.deps import require_staff
from app.domains.staff.domain.credentials import verify_password
from app.domains.staff.domain.entity import Staff
from app.infrastructure.config.settings import get_settings
from app.infrastructure.security.rate_limit import limiter

logger = logging.getLogger("majung.staff")

router = APIRouter(prefix="/api/staff", tags=["staff"])

CurrentStaff = Annotated[Staff, Depends(require_staff)]


class LoginIn(BaseModel):
    login_id: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=200)


class LoginOut(BaseModel):
    staff_id: str
    display_name: str
    org_kind: str
    branch: str
    # 앱이 보관한다. 8시간 뒤 만료되고 다시 로그인해야 한다 —
    # 담당자 기기가 공용일 가능성을 전제한다(§8.2).
    session_token: str


class StaffMeOut(BaseModel):
    staff_id: str
    login_id: str
    display_name: str
    org_kind: str
    branch: str
    # 지부 필터가 켜져 있는지. 화면이 "지금 무엇을 보고 있는지" 알리는 데 쓴다.
    branch_filter_on: bool


@router.post("/login", response_model=LoginOut)
@limiter.limit(get_settings().rate_limit_gate)
def login(body: LoginIn, request: Request) -> LoginOut:
    """비밀번호 로그인.

    **아이디가 틀렸는지 비밀번호가 틀렸는지 구분해 알리지 않는다.** 구분하면
    존재하는 아이디를 찾아내는 길이 된다. 응답도 rate limit도 같다.
    """
    staff_repo = getattr(request.app.state, "staff_repo", None)
    sessions = getattr(request.app.state, "staff_session_repo", None)
    if staff_repo is None or sessions is None:
        raise HTTPException(
            status_code=503, detail="지금은 이용할 수 없어요. 잠시 후 다시 시도해 주세요."
        )

    found = staff_repo.by_login_id(body.login_id.strip())
    if found is None or not verify_password(body.password, found[1]):
        # 어느 아이디로 시도했는지도 로그에 남기지 않는다 — 그 자체가 단서다.
        logger.warning("담당자 로그인 실패")
        raise HTTPException(status_code=401, detail="아이디나 비밀번호를 다시 확인해 주세요.")

    staff = found[0]
    token = sessions.issue(staff.id, datetime.now(UTC))
    return LoginOut(
        staff_id=str(staff.id),
        display_name=staff.display_name,
        org_kind=staff.org_kind.value,
        branch=staff.branch,
        session_token=token,
    )


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    staff: CurrentStaff,
    authorization: str | None = Header(default=None),
) -> None:
    """로그아웃. 공용 기기를 전제하므로 나갈 길이 반드시 있어야 한다(§8.2)."""
    sessions = request.app.state.staff_session_repo
    token = (authorization or "").partition(" ")[2].strip()
    if token:
        sessions.revoke(token)


@router.get("/me", response_model=StaffMeOut)
def read_me(request: Request, staff: CurrentStaff) -> StaffMeOut:
    return StaffMeOut(
        staff_id=str(staff.id),
        login_id=staff.login_id,
        display_name=staff.display_name,
        org_kind=staff.org_kind.value,
        branch=staff.branch,
        branch_filter_on=get_settings().staff_branch_filter,
    )
