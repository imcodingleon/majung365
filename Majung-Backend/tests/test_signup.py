"""가입 — 기획서 §2.4·§3.1.

저장소는 페이크로 둔다. 실제 DB 동작은 별도로 확인했고, 여기서 지키려는 것은
**동의 없이 죄목이 저장되지 않는가**와 **가입이 첫 할 일 목록으로 이어지는가**다.
"""

from dataclasses import dataclass, field
from datetime import date
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from app.domains.account.application.usecase import SignupCommand, SignupUseCase
from app.domains.account.domain.entity import Account, Consent, CrimeCategory, Session
from app.domains.account.domain.tokens import expires_at, utcnow
from app.domains.knowledge.application.intake_usecase import IntakeUseCase
from app.domains.knowledge.infrastructure.intake_rules_repository import (
    JsonIntakeRuleRepository,
)
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository


@dataclass
class FakeAccounts:
    saved: list[Account] = field(default_factory=list)
    consents: list[Consent] = field(default_factory=list)

    def create(
        self, *, name: str, birth_date: date, release_date: date, consents: list[Consent]
    ) -> Account:
        account = Account(
            id=uuid4(),
            name=name,
            birth_date=birth_date,
            release_date=release_date,
            created_at=utcnow(),
            last_seen_on=date.today(),
        )
        self.saved.append(account)
        self.consents.extend(consents)
        return account

    def by_id(self, user_id: UUID) -> Account | None:
        return next((a for a in self.saved if a.id == user_id), None)

    def record_consent(self, user_id: UUID, consent: Consent) -> None:
        self.consents.append(consent)

    def touch(self, user_id: UUID, today: date) -> None: ...

    def delete(self, user_id: UUID) -> None: ...


@dataclass
class FakeCrimes:
    stored: dict[UUID, str] = field(default_factory=dict)
    fail: bool = False

    def set(self, user_id: UUID, category: str) -> CrimeCategory:
        if self.fail:
            raise RuntimeError("저장 실패")
        self.stored[user_id] = category
        return CrimeCategory(user_id=user_id, category=category, consented_at=utcnow())

    def by_user(self, user_id: UUID) -> CrimeCategory | None:
        cat = self.stored.get(user_id)
        return CrimeCategory(user_id, cat, utcnow()) if cat else None

    def revoke(self, user_id: UUID) -> None:
        self.stored.pop(user_id, None)


@dataclass
class FakeSessions:
    issued: list[UUID] = field(default_factory=list)

    def issue(self, user_id: UUID) -> str:
        self.issued.append(user_id)
        return f"token-{user_id}"

    def resolve(self, token: str, today: date) -> Session | None:
        return Session(uuid4(), expires_at(utcnow()))

    def revoke_all(self, user_id: UUID) -> None: ...


def _usecase(crimes: FakeCrimes | None = None) -> tuple[SignupUseCase, FakeAccounts, FakeCrimes]:
    accounts, crime_repo = FakeAccounts(), crimes or FakeCrimes()
    intake = IntakeUseCase(
        institutions=JsonInstitutionRepository(),
        rules=JsonIntakeRuleRepository().all(),
    )
    return SignupUseCase(accounts, crime_repo, FakeSessions(), intake), accounts, crime_repo


def _command(**kw: object) -> SignupCommand:
    base = dict(
        name="김판수",
        birth_date=date(1975, 3, 2),
        release_date=date(2026, 8, 3),
        answers={"identityStatus": "NOT_USABLE", "counselingNeed": "NEEDED"},
        consents=(Consent("privacy", True, utcnow()),),
        crime_category=None,
    )
    return SignupCommand(**{**base, **kw})  # type: ignore[arg-type]


def test_signup_returns_tasks_right_away() -> None:
    """가입만 하고 아무 일도 일어나지 않으면 무엇을 위해 27문항을 답했는지 알 수 없다."""
    usecase, _, _ = _usecase()
    result = usecase.run(_command())
    assert result.tasks
    assert {t.route_id for t in result.tasks} == {"R9", "R8"}


def test_session_token_is_issued() -> None:
    usecase, _, _ = _usecase()
    assert usecase.run(_command()).session_token


def test_crime_is_stored_when_given() -> None:
    usecase, _, crimes = _usecase()
    result = usecase.run(_command(crime_category="재산·경제범죄"))
    assert crimes.stored[result.account.id] == "재산·경제범죄"


def test_crime_is_not_stored_without_it() -> None:
    """죄목은 선택이다. 없으면 개인화가 얕아지지만 서비스가 막히지는 않는다."""
    usecase, _, crimes = _usecase()
    usecase.run(_command())
    assert crimes.stored == {}


def test_crime_failure_does_not_break_signup() -> None:
    """죄목 저장이 실패해도 가입은 살린다 — 27문항을 다시 답하게 하는 것보다
    개인화가 얕은 채로 시작하는 편이 낫다."""
    usecase, accounts, _ = _usecase(FakeCrimes(fail=True))
    result = usecase.run(_command(crime_category="재산·경제범죄"))
    assert result.session_token and result.tasks
    assert accounts.saved


def test_consents_are_recorded() -> None:
    usecase, accounts, _ = _usecase()
    usecase.run(_command(consents=(Consent("privacy", True, utcnow()),
                                   Consent("crime_category", False, utcnow()))))
    assert {c.kind for c in accounts.consents} == {"privacy", "crime_category"}


def test_plain_values_reach_the_repository() -> None:
    """도메인은 평문을 다룬다. 암호화는 저장 직전(infrastructure)에 걸린다 —
    도메인이 암호문을 들고 다니면 판정 로직이 복호화 여부를 신경 써야 한다."""
    usecase, accounts, _ = _usecase()
    usecase.run(_command())
    assert accounts.saved[0].name == "김판수"


@pytest.fixture
def client():  # type: ignore[no-untyped-def]
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


def test_endpoint_rejects_future_release_date(client) -> None:  # type: ignore[no-untyped-def]
    """출소날짜가 미래면 입력 실수다. 기한 판정이 어긋난다."""
    with client:
        r = client.post(
            "/api/signup",
            json={
                "name": "김판수",
                "birth_date": "1975-03-02",
                "release_date": "2099-01-01",
                "answers": {},
            },
        )
    assert r.status_code == 400


def test_endpoint_drops_crime_without_consent(client) -> None:  # type: ignore[no-untyped-def]
    """동의 없이 저장된 죄목은 있어서는 안 된다. 값이 와도 버린다.

    **필수 동의는 하고 죄목 동의만 안 한 경우다.** 둘 다 없으면 가입 자체가
    막혀서(§3.1) 죄목을 버리는지 확인할 수 없다 — 확인하려는 것이 가려진다.
    """
    from app.domains.account.adapter.inbound.api.router import (
        ConsentIn,
        SignupIn,
        _to_command,
    )

    body = SignupIn(
        name="김판수",
        birth_date=date(1975, 3, 2),
        release_date=date(2026, 8, 3),
        answers={},
        consents=[ConsentIn(kind="privacy", agreed=True)],
        # 화면이 쓰는 값이다. 한글 라벨이 아니라 id로 온다.
        crime_category="property",
    )
    assert _to_command(body, date(2026, 8, 23)).crime_category is None


# ── 모르는 값은 막는다 (기획서 §4.1) ──


def test_unknown_consent_kind_is_refused(client) -> None:  # type: ignore[no-untyped-def]
    """**어긋나도 200이 오는 것이 가장 나쁘다.**

    검증이 없으면 프론트가 다른 값을 보내도 저장은 되고, 아무도 모르는 채로
    기록만 어긋난다.
    """
    from app.domains.account.adapter.inbound.api.router import SignupIn

    with pytest.raises(ValidationError, match="모르는 동의 종류"):
        SignupIn(
            name="김판수",
            birth_date=date(1975, 3, 2),
            release_date=date(2026, 8, 3),
            consents=[{"kind": "마케팅수신", "agreed": True}],  # type: ignore[list-item]
        )


def test_undisclosed_crime_is_refused() -> None:
    """**말하지 않겠다고 한 것을 값으로 저장하면 그것도 하나의 기록이 된다**(§9.1).

    프론트는 그 경우 필드 자체를 빼고 보낸다. 값이 오면 프론트 쪽 버그다.
    """
    from app.domains.account.adapter.inbound.api.router import SignupIn

    for bad in ("undisclosed", "재산·경제범죄", "unknown"):
        with pytest.raises(ValidationError, match="모르는 죄목"):
            SignupIn(
                name="김판수",
                birth_date=date(1975, 3, 2),
                release_date=date(2026, 8, 3),
                crime_category=bad,
            )


def test_known_values_pass() -> None:
    from app.domains.account.adapter.inbound.api.router import SignupIn

    body = SignupIn(
        name="김판수",
        birth_date=date(1975, 3, 2),
        release_date=date(2026, 8, 3),
        consents=[
            {"kind": "privacy", "agreed": True},  # type: ignore[list-item]
            {"kind": "share", "agreed": False},  # type: ignore[list-item]
        ],
        crime_category="property",
    )
    assert body.crime_category == "property"


def test_consented_crime_is_kept() -> None:
    """**동의했으면 저장되어야 한다.**

    "동의 없으면 버린다"만 확인하고 있어서, 판정 함수가 엉뚱한 값을 보는데도
    테스트가 통과했다. 검증 목록은 "crime"을 받는데 판정은 "crime_category"를
    찾아서 **동의하고 보낸 죄목이 조용히 버려졌다.** 오류도 안 나고 저장만
    안 되니 화면에서도 알 수 없다.

    막는 것을 확인했으면 통과시키는 것도 확인해야 한다.
    """
    from app.domains.account.adapter.inbound.api.router import SignupIn, _to_command

    body = SignupIn(
        name="김판수",
        birth_date=date(1975, 3, 2),
        release_date=date(2026, 8, 3),
        consents=[
            {"kind": "privacy", "agreed": True},  # type: ignore[list-item]
            {"kind": "crime", "agreed": True},  # type: ignore[list-item]
        ],
        crime_category="property",
    )
    assert _to_command(body, date(2026, 8, 23)).crime_category == "property"


def test_refused_crime_consent_drops_the_value() -> None:
    """동의 화면을 보고 거부한 경우다. 값이 와도 버린다."""
    from app.domains.account.adapter.inbound.api.router import SignupIn, _to_command

    body = SignupIn(
        name="김판수",
        birth_date=date(1975, 3, 2),
        release_date=date(2026, 8, 3),
        consents=[
            {"kind": "privacy", "agreed": True},  # type: ignore[list-item]
            {"kind": "crime", "agreed": False},  # type: ignore[list-item]
        ],
        crime_category="property",
    )
    assert _to_command(body, date(2026, 8, 23)).crime_category is None


def test_consent_kind_names_match_between_check_and_validation() -> None:
    """**검증 목록과 판정이 같은 이름을 봐야 한다.**

    이 둘이 갈리면 검증은 통과시키고 판정은 못 찾는다 — 조용히 작동을 멈춘다.
    """
    from app.domains.account.domain.entity import CONSENT_KINDS, CRIME_CONSENT_KIND

    assert CRIME_CONSENT_KIND in CONSENT_KINDS
