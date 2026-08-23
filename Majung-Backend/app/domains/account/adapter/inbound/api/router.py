"""POST /api/signup — 가입 인바운드 어댑터.

기획서 §2.4·§3.1. 개인정보와 27문항 답변을 한 번에 받고, 세션 토큰과 첫 할 일
목록을 돌려준다.

보안에서 지키는 것 셋.
- **이름·생일·출소날짜를 로그에 남기지 않는다.** 오류 메시지에도 담지 않는다
- **세션 토큰 원문은 이 응답으로 딱 한 번 나간다.** 서버에는 해시만 남는다
- 좌표는 받지 않는다. 요청 본문에 그 자리가 없다(§9.5)
"""

from datetime import date

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.domains.account.application.usecase import SignupCommand
from app.domains.account.domain.entity import Consent
from app.domains.account.domain.tokens import utcnow
from app.domains.knowledge.adapter.inbound.api.router import IntakeTaskOut, to_task_out
from app.infrastructure.config.settings import get_settings
from app.infrastructure.security.rate_limit import limiter

router = APIRouter(prefix="/api", tags=["account"])

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


def _crime_consented(body: SignupIn) -> bool:
    return any(c.kind == "crime_category" and c.agreed for c in body.consents)


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

    result = usecase.run(_to_command(body, date.today()))
    return SignupOut(
        user_id=str(result.account.id),
        session_token=result.session_token,
        tasks=[to_task_out(t) for t in result.tasks],
    )
