"""POST /api/signup · GET·PATCH·DELETE /api/me — 계정 인바운드 어댑터.

기획서 §2.4·§3.1. 개인정보와 27문항 답변을 한 번에 받고, 세션 토큰과 첫 할 일
목록을 돌려준다.

보안에서 지키는 것 셋.
- **이름·생일·출소날짜를 로그에 남기지 않는다.** 오류 메시지에도 담지 않는다
- **세션 토큰 원문은 이 응답으로 딱 한 번 나간다.** 서버에는 해시만 남는다
- 좌표는 받지 않는다. 요청 본문에 그 자리가 없다(§9.5)
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from app.domains.account.adapter.inbound.api.deps import require_account
from app.domains.account.application.usecase import SignupCommand
from app.domains.account.domain.entity import (
    CONSENT_KINDS,
    CRIME_CATEGORIES,
    CRIME_CONSENT_KIND,
    Account,
    Consent,
    PRIVACY_CONSENT_KIND,
)
from app.domains.account.domain.tokens import utcnow
from app.domains.shared.clock import today_kst
from app.domains.knowledge.adapter.inbound.api.router import IntakeTaskOut, to_task_out
from app.infrastructure.config.settings import get_settings
from app.infrastructure.security.rate_limit import limiter

router = APIRouter(prefix="/api", tags=["account"])

# 세션으로 확인된 사용자. Depends를 기본값에 두면 린터가 잡으므로 Annotated로 쓴다.
CurrentAccount = Annotated[Account, Depends(require_account)]

_MAX_NAME = 40
_MAX_ANSWER_KEYS = 40
_MAX_ANSWER_LEN = 200
_MAX_MULTI = 20
# 출소날짜가 미래이거나 터무니없이 과거면 입력 실수다. 기한 판정이 어긋난다.
_MAX_RELEASE_AGO_DAYS = 365 * 10


class ConsentIn(BaseModel):
    kind: str = Field(min_length=1, max_length=40)
    agreed: bool


class SignupIn(BaseModel):
    name: str = Field(min_length=1, max_length=_MAX_NAME)
    birth_date: date
    release_date: date
    # 화면에 보이지 않은 문항의 답은 오지 않는다(§3.8). 키가 사람마다 다르므로
    # 특정 키가 항상 온다고 가정하지 않는다.
    answers: dict[str, str | list[str]] = Field(default_factory=dict)
    consents: list[ConsentIn] = Field(default_factory=list, max_length=20)
    # 죄목은 선택이다. 별도 동의를 받았을 때만 온다.
    crime_category: str | None = Field(default=None, max_length=40)

    @field_validator("consents")
    @classmethod
    def _known_consents(cls, given: list[ConsentIn]) -> list[ConsentIn]:
        """모르는 동의 종류는 막는다. **조용히 저장되면 아무도 모른다.**"""
        unknown = sorted({c.kind for c in given} - CONSENT_KINDS)
        if unknown:
            raise ValueError(f"모르는 동의 종류: {unknown}")
        return given

    @field_validator("crime_category")
    @classmethod
    def _known_crime(cls, given: str | None) -> str | None:
        """모르는 죄목 값은 막는다.

        "말하고 싶지 않아요"에 해당하는 값이 오면 그것도 막는다 — 말하지 않겠다고
        한 것을 값으로 저장하면 그것도 하나의 기록이 된다. 프론트는 그 경우
        필드 자체를 빼고 보낸다.
        """
        if given is not None and given not in CRIME_CATEGORIES:
            raise ValueError(f"모르는 죄목 값: {given}")
        return given


class SignupOut(BaseModel):
    user_id: str
    # 앱이 expo-secure-store에 보관한다. 이 값은 다시 조회할 수 없다.
    session_token: str
    tasks: list[IntakeTaskOut]


def _to_command(body: SignupIn, today: date) -> SignupCommand:
    if body.birth_date >= today:
        raise HTTPException(status_code=400, detail="생일을 다시 확인해 주세요.")
    if body.release_date > today:
        raise HTTPException(status_code=400, detail="출소날짜를 다시 확인해 주세요.")
    if (today - body.release_date).days > _MAX_RELEASE_AGO_DAYS:
        raise HTTPException(status_code=400, detail="출소날짜를 다시 확인해 주세요.")

    if len(body.answers) > _MAX_ANSWER_KEYS:
        raise HTTPException(status_code=400, detail="답변이 너무 많아요.")
    answers: dict[str, object] = {}
    for key, value in body.answers.items():
        if isinstance(value, list):
            if len(value) > _MAX_MULTI or any(len(v) > _MAX_ANSWER_LEN for v in value):
                raise HTTPException(status_code=400, detail="답변 값이 올바르지 않아요.")
        elif len(value) > _MAX_ANSWER_LEN:
            raise HTTPException(status_code=400, detail="답변 값이 올바르지 않아요.")
        answers[key] = value

    if not _privacy_consented(body):
        # **동의 없이 저장하지 않는다.** 여기서 막지 않으면 개인정보가 먼저
        # 들어가고 동의는 영영 오지 않는다 — 받아 두고 나중에 받는 순서는
        # 성립하지 않는다(§3.1·§9). 죄목처럼 항목만 버리는 것으로는 안 된다.
        raise HTTPException(
            status_code=400, detail="개인정보 수집·이용에 동의해야 시작할 수 있어요."
        )

    now = utcnow()
    return SignupCommand(
        name=body.name.strip(),
        birth_date=body.birth_date,
        release_date=body.release_date,
        answers=answers,
        consents=tuple(Consent(kind=c.kind, agreed=c.agreed, at=now) for c in body.consents),
        # 동의하지 않았으면 죄목을 받지 않는다. 값이 와도 버린다 —
        # 동의 없이 저장된 죄목은 있어서는 안 된다.
        crime_category=body.crime_category if _crime_consented(body) else None,
    )


def _privacy_consented(body: SignupIn) -> bool:
    """필수 동의가 있는가. **이름은 도메인이 정하고 여기서는 가져다 쓴다.**"""
    return any(
        c.kind == PRIVACY_CONSENT_KIND and c.agreed for c in body.consents
    )


def _crime_consented(body: SignupIn) -> bool:
    """죄목 동의가 있는가. **이름은 도메인이 정하고 여기서는 가져다 쓴다.**"""
    return any(
        c.kind == CRIME_CONSENT_KIND and c.agreed for c in body.consents
    )


@router.post("/signup", response_model=SignupOut)
@limiter.limit(get_settings().rate_limit_chat)
def signup(body: SignupIn, request: Request) -> SignupOut:
    """가입하고 첫 할 일 목록을 받는다.

    가입만 하고 아무 일도 일어나지 않으면 무엇을 위해 27문항을 답했는지 알 수 없다.
    그래서 목록을 같은 응답에 담는다.
    """
    usecase = getattr(request.app.state, "signup_usecase", None)
    if usecase is None:
        # 저장 설정이 없으면 가입을 받지 않는다. 받아 두고 버리는 것이 가장 나쁘다 —
        # 화면은 "안전하게 보관한다"고 말하는데 서버는 아무것도 하지 않는 상태가 된다.
        raise HTTPException(
            status_code=503, detail="지금은 가입을 받을 수 없어요. 잠시 후 다시 시도해 주세요."
        )

    result = usecase.run(_to_command(body, today_kst()))
    return SignupOut(
        user_id=str(result.account.id),
        session_token=result.session_token,
        tasks=[to_task_out(t) for t in result.tasks],
    )


# ── 내 정보 (§9.4 법적 요구) ──
#
# 열람·수정·삭제는 개인정보보호법이 보장하는 권리다. 기능이 없으면 위법이다.
# **죄목만 지우는 것과 계정 전체 삭제를 구분한다** — 죄목 동의를 철회했다고
# 계정까지 사라지면 27문항을 다시 답해야 한다.


class MeOut(BaseModel):
    user_id: str
    name: str
    birth_date: date
    release_date: date
    days_since_release: int
    # 죄목 동의 여부. **값 자체는 여기서 내보내지 않는다** — 화면에 띄우면
    # 어깨 너머로 보인다. 무엇을 지울 수 있는지만 알려준다.
    has_crime_category: bool


class MeUpdateIn(BaseModel):
    """수정할 항목만 보낸다. 이름·생일·출소날짜는 바꿀 수 있고 죄목은 철회만 된다."""

    crime_category_revoked: bool = False


@router.get("/me", response_model=MeOut)
def read_me(request: Request, account: CurrentAccount) -> MeOut:
    crimes = getattr(request.app.state, "crime_repo", None)
    has_crime = bool(crimes and crimes.by_user(account.id))
    return MeOut(
        user_id=str(account.id),
        name=account.name,
        birth_date=account.birth_date,
        release_date=account.release_date,
        days_since_release=account.days_since_release(today_kst()),
        has_crime_category=has_crime,
    )


@router.patch("/me", response_model=MeOut)
def update_me(
    body: MeUpdateIn,
    request: Request,
    account: CurrentAccount,
) -> MeOut:
    """지금은 죄목 철회만 받는다.

    이름·생일·출소날짜 수정은 암호화된 컬럼을 다시 쓰는 일이라 별도로 붙인다.
    철회를 먼저 두는 이유는 **동의 철회가 법적 권리**이고 지연되면 안 되기 때문이다.
    """
    crimes = getattr(request.app.state, "crime_repo", None)
    if body.crime_category_revoked and crimes is not None:
        crimes.revoke(account.id)  # 그 행만 지운다. 계정은 남는다(§9.5)
    return read_me(request, account)


@router.delete("/me", status_code=204)
def delete_me(request: Request, account: CurrentAccount) -> None:
    """즉시 파기(§9.4). 죄목·동의·세션이 함께 지워진다(on delete cascade).

    **사전 통지는 하지 않는다** — 연락처를 받지 않아 닿을 수단이 없고,
    지우겠다는 사람에게 다시 묻는 것도 이 서비스의 태도가 아니다.
    """
    accounts = request.app.state.account_repo
    accounts.delete(account.id)
