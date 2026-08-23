"""SignupUseCase — 가입 정보 저장 + 세션 발급 + 첫 할 일 목록.

기획서 §2.4·§3.1. 가입 화면 하나에서 개인정보와 27문항 답변을 함께 받는다.
답을 다 하고 나면 **바로 할 일 목록이 나와야 한다** — 가입만 하고 아무 일도
일어나지 않으면 무엇을 위해 답했는지 알 수 없다.

**죄목은 선택이다.** 별도 동의를 받고, 동의하지 않으면 그 정보 없이 진행한다.
죄목이 없으면 개인화가 얕아지지만 서비스가 막히지는 않는다.
"""

import logging
from dataclasses import dataclass
from datetime import date

from app.domains.account.domain.entity import Account, Consent
from app.domains.account.domain.repository import (
    AccountRepository,
    CrimeRepository,
    SessionRepository,
)
from app.domains.knowledge.application.dto import IntakeTask
from app.domains.knowledge.application.intake_usecase import IntakeUseCase
from app.domains.knowledge.domain.state import IntakeStateRepository

logger = logging.getLogger("majung.account")


@dataclass(frozen=True)
class SignupCommand:
    name: str
    birth_date: date
    release_date: date
    # 화면에 보인 문항의 답만 온다(§3.8). 키가 사람마다 다르다.
    answers: dict[str, object]
    # 동의 항목과 동의 시각. 무엇에 동의했는지는 평문으로 남긴다.
    consents: tuple[Consent, ...] = ()
    # 죄목 대분류. 별도 동의를 받았을 때만 온다.
    crime_category: str | None = None


@dataclass(frozen=True)
class SignupResult:
    """**세션 토큰 원문은 이 응답으로 딱 한 번 나간다.** 서버에는 해시만 남는다."""

    account: Account
    session_token: str
    tasks: tuple[IntakeTask, ...]


class SignupUseCase:
    def __init__(
        self,
        accounts: AccountRepository,
        crimes: CrimeRepository,
        sessions: SessionRepository,
        intake: IntakeUseCase,
        states: IntakeStateRepository | None = None,
    ) -> None:
        self._accounts = accounts
        self._crimes = crimes
        self._sessions = sessions
        self._intake = intake
        # **없어도 가입은 된다.** 저장이 꺼진 로컬·데모에서는 None으로 온다.
        self._states = states

    def run(self, cmd: SignupCommand) -> SignupResult:
        account = self._accounts.create(
            name=cmd.name,
            birth_date=cmd.birth_date,
            release_date=cmd.release_date,
            consents=list(cmd.consents),
        )

        if cmd.crime_category:
            # 죄목 저장이 실패해도 가입 자체는 살린다. 27문항을 다시 답하게 하는 것보다
            # 개인화가 얕은 채로 시작하는 편이 낫다.
            try:
                self._crimes.set(account.id, cmd.crime_category)
            except Exception:
                # 사용자 입력 원문은 로그에 남기지 않는다.
                logger.warning("죄목 저장 실패 — 그 정보 없이 진행한다")

        token = self._sessions.issue(account.id)

        # **판정만 남긴다** (§9.1 · 0008 마이그레이션). 답변 원문은 저장하지 않되,
        # 세션이 끊겼을 때 같은 할 일 목록을 다시 만들 수 있어야 한다. 그 둘을
        # 함께 만족시키는 것이 판정이다.
        verdicts = self._intake.judge_only(cmd.answers)
        if self._states is not None:
            self._states.save(account.id, verdicts)

        tasks = self._intake.from_verdicts(verdicts)
        return SignupResult(account=account, session_token=token, tasks=tasks)
