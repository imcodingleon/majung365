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
    PRIVACY_CONSENT_KIND,
    Account,
    Consent,
)
from app.domains.account.domain.tokens import utcnow
from app.domains.knowledge.adapter.inbound.api.router import IntakeTaskOut, to_task_out
from app.domains.shared.clock import today_kst
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
    """수정할 항목만 보낸다. 지금은 죄목을 밝히거나 철회할 수 있다."""

    crime_category_revoked: bool = False
    # 새로 밝히는 죄목. **동의 없이는 저장하지 않는다** (§9.5).
    crime_category: str | None = None
    # 이 요청과 함께 받은 민감정보 동의. 값을 보내면서 이것이 없으면 거절한다.
    crime_consent_agreed: bool = False

    @field_validator("crime_category")
    @classmethod
    def _known_crime(cls, given: str | None) -> str | None:
        """가입 때와 같은 규칙이다. "말하고 싶지 않아요"는 값이 아니라 철회로 온다."""
        if given is not None and given not in CRIME_CATEGORIES:
            raise ValueError(f"모르는 죄목 값: {given}")
        return given


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


class TasksOut(BaseModel):
    """세션을 되살렸을 때 돌려주는 것. 가입 응답의 `tasks`와 같은 모양이다."""

    name: str
    tasks: list[IntakeTaskOut]
    completed: list[str]


class CompletedIn(BaseModel):
    """마친 항목 **전체 목록**을 받는다.

    더하기만 받으면 되돌리기를 표현할 수 없다. 실수로 완료를 누른 사람이 그것을
    되돌리는 길이 있어야 하고(§5.2), 그러면 목록을 통째로 주고받는 편이 단순하다.
    """

    completed: list[str] = Field(default_factory=list, max_length=20)


@router.get("/tasks", response_model=TasksOut)
def read_tasks(request: Request, account: CurrentAccount) -> TasksOut:
    """세션 토큰만으로 할 일을 되살린다 (§5.2).

    **왜 필요한가.** 앱을 닫거나 새로고침하면 진단 답변도 할 일도 사라져 가입
    화면부터 다시 시작하게 된다. 27문항을 다시 답하게 하는 것은 이 사용자층에게
    특히 무거운 요구다.

    **답변 원문은 서버에 없다.** 저장된 것은 판정뿐이고(§9.1 · 0008), 카드 본문은
    지식 베이스에서 지금 다시 만들어진다 — 그래서 복원된 화면도 최신 안내를 받는다.
    """
    states = getattr(request.app.state, "intake_state_repo", None)
    if states is None:
        raise HTTPException(
            status_code=503, detail="지금은 이용할 수 없어요. 잠시 후 다시 시도해 주세요."
        )

    state = states.by_user(account.id)
    if state is None:
        # 저장이 꺼져 있던 때 가입했거나 판정을 못 읽은 경우다. 빈 목록을 주고
        # 화면이 "다시 가입" 쪽으로 안내하게 둔다 — 없는 것을 있는 척하지 않는다.
        raise HTTPException(status_code=404, detail="이어서 볼 내용을 찾지 못했어요.")

    intake = request.app.state.intake_usecase
    tasks = intake.from_verdicts(state.verdicts)
    return TasksOut(
        name=account.name,
        tasks=[to_task_out(t) for t in tasks],
        completed=sorted(state.completed),
    )


class RetakeIn(BaseModel):
    """상황 알아보기를 다시 했을 때 오는 답. 가입 때와 같은 모양이다."""

    answers: dict[str, str | list[str]] = Field(default_factory=dict)


@router.put("/tasks", response_model=TasksOut)
def retake_intake(
    body: RetakeIn,
    request: Request,
    account: CurrentAccount,
) -> TasksOut:
    """상황 알아보기를 다시 하고 할 일을 새로 받는다 (§3.7).

    **상황은 바뀐다.** 잘 곳이 생기고 신분증이 나오고 일자리가 정해진다. 처음 답한
    것에 묶여 있으면 이미 해결된 일이 계속 할 일로 남고, 새로 생긴 문제는 목록에
    들어오지 않는다.

    **여기서도 답변 원문은 저장하지 않는다** (§9.1 · 0008). 판정만 갈아 끼운다.

    **완료 목록은 비운다.** 할 일이 새로 정해진 것이라 예전에 마친 표시를 그대로
    두면 이번에 처음 나온 항목이 이미 끝난 것으로 보인다.
    """
    states = getattr(request.app.state, "intake_state_repo", None)
    if states is None:
        raise HTTPException(
            status_code=503, detail="지금은 이용할 수 없어요. 잠시 후 다시 시도해 주세요."
        )

    if len(body.answers) > _MAX_ANSWER_KEYS:
        raise HTTPException(status_code=422, detail="적어 주신 내용을 다시 확인해 주세요.")
    answers: dict[str, object] = {}
    for key, value in body.answers.items():
        if isinstance(value, str) and len(value) > _MAX_ANSWER_LEN:
            raise HTTPException(status_code=422, detail="적어 주신 내용을 다시 확인해 주세요.")
        if isinstance(value, list) and (
            len(value) > _MAX_MULTI
            # **안의 값 길이도 본다.** 개수만 세면 20개 이내인 한 값이 아무리
            # 길어도 통과해, 같은 데이터를 받는 가입 경로보다 느슨해진다.
            or any(len(v) > _MAX_ANSWER_LEN for v in value)
        ):
            raise HTTPException(status_code=422, detail="적어 주신 내용을 다시 확인해 주세요.")
        answers[key] = value

    intake = request.app.state.intake_usecase
    states.save(account.id, intake.judge_only(answers))
    return read_tasks(request, account)


@router.put("/tasks/completed", response_model=TasksOut)
def update_completed(
    body: CompletedIn,
    request: Request,
    account: CurrentAccount,
) -> TasksOut:
    """마친 항목을 서버에 남긴다.

    **여기서 목록을 줄이지 않는다.** 마친 것도 화면에 남아야 하기 때문이다
    (§5.2 — "1번 탭이 닫히면서 색이 바뀌고"). 무엇을 마쳤는지는 `completed`가 말한다.
    """
    states = getattr(request.app.state, "intake_state_repo", None)
    if states is None:
        raise HTTPException(
            status_code=503, detail="지금은 이용할 수 없어요. 잠시 후 다시 시도해 주세요."
        )
    states.set_completed(account.id, frozenset(body.completed))
    return read_tasks(request, account)


@router.patch("/me", response_model=MeOut)
def update_me(
    body: MeUpdateIn,
    request: Request,
    account: CurrentAccount,
) -> MeOut:
    """죄목을 밝히거나 철회한다.

    이름·생일·출소날짜 수정은 암호화된 컬럼을 다시 쓰는 일이라 별도로 붙인다.
    철회를 먼저 만든 이유는 **동의 철회가 법적 권리**이고 지연되면 안 되기 때문이다.

    **밝히는 쪽이 오래 빠져 있었다.** 처음에는 말하지 않다가 서비스를 써보고 마음이
    바뀔 수 있다고 §3.3-3이 정해 두었는데, 철회만 받으니 화면의 "바꾸기"가 실제로는
    지우기 하나뿐이었다. 고른 값은 조용히 버려졌다.
    """
    crimes = getattr(request.app.state, "crime_repo", None)
    if crimes is None:
        raise HTTPException(
            status_code=503, detail="지금은 이용할 수 없어요. 잠시 후 다시 시도해 주세요."
        )

    if body.crime_category_revoked:
        crimes.revoke(account.id)  # 그 행만 지운다. 계정은 남는다(§9.5)
        return read_me(request, account)

    if body.crime_category is None:
        return read_me(request, account)

    # **동의가 먼저다.** 값만 보내면 거절한다 — 민감정보를 동의 없이 저장하는 경로가
    # 하나라도 열려 있으면 §9.5는 지켜지지 않는다.
    if not body.crime_consent_agreed:
        raise HTTPException(status_code=400, detail="먼저 동의해 주세요.")

    accounts = request.app.state.account_repo
    accounts.record_consent(
        account.id,
        Consent(kind=CRIME_CONSENT_KIND, agreed=True, at=utcnow()),
    )
    crimes.set(account.id, body.crime_category)
    return read_me(request, account)


@router.delete("/me", status_code=204)
def delete_me(request: Request, account: CurrentAccount) -> None:
    """즉시 파기(§9.4). 죄목·동의·세션이 함께 지워진다(on delete cascade).

    **사전 통지는 하지 않는다** — 연락처를 받지 않아 닿을 수단이 없고,
    지우겠다는 사람에게 다시 묻는 것도 이 서비스의 태도가 아니다.
    """
    accounts = request.app.state.account_repo
    accounts.delete(account.id)
