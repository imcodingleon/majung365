"""내 정보에서 죄목을 밝히고 지우는 길 (§3.3-3·§9.5).

**지키려는 것은 하나다 — 동의 없이 죄목이 저장되지 않는가.** 저장하는 경로가 둘로
늘었으므로(가입·내 정보) 새로 생긴 쪽에도 같은 관문이 있어야 한다.

밝히는 길이 오래 빠져 있었다. 철회만 받으니 화면의 "바꾸기"가 실제로는 지우기
하나뿐이었고, 고른 값은 아무 데도 가지 않고 사라졌다.
"""

from dataclasses import dataclass, field
from datetime import date
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from app.domains.account.adapter.inbound.api.router import MeUpdateIn, update_me
from app.domains.account.domain.entity import Account, Consent, CrimeCategory
from app.domains.account.domain.tokens import utcnow


@dataclass
class FakeCrimes:
    stored: dict[UUID, str] = field(default_factory=dict)

    def set(self, user_id: UUID, category: str) -> CrimeCategory:
        self.stored[user_id] = category
        return CrimeCategory(user_id=user_id, category=category, consented_at=utcnow())

    def by_user(self, user_id: UUID) -> CrimeCategory | None:
        found = self.stored.get(user_id)
        if found is None:
            return None
        return CrimeCategory(user_id=user_id, category=found, consented_at=utcnow())

    def revoke(self, user_id: UUID) -> None:
        self.stored.pop(user_id, None)


@dataclass
class FakeAccounts:
    consents: list[Consent] = field(default_factory=list)

    def record_consent(self, user_id: UUID, consent: Consent) -> None:
        self.consents.append(consent)


ACCOUNT = Account(
    id=uuid4(),
    name="김판수",
    birth_date=date(1975, 3, 2),
    release_date=date(2026, 8, 3),
    created_at=utcnow(),
    last_seen_on=date(2026, 8, 26),
)


def _request(crimes: FakeCrimes, accounts: FakeAccounts) -> SimpleNamespace:
    """`app.state`만 있으면 되는 자리다. 서버 전체를 띄우지 않는다."""
    return SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(crime_repo=crimes, account_repo=accounts))
    )


def test_telling_stores_the_category() -> None:
    crimes, accounts = FakeCrimes(), FakeAccounts()
    body = MeUpdateIn(crime_category="property", crime_consent_agreed=True)

    out = update_me(body, _request(crimes, accounts), ACCOUNT)  # type: ignore[arg-type]

    assert crimes.stored[ACCOUNT.id] == "property"
    assert out.has_crime_category is True


def test_telling_leaves_a_consent_record() -> None:
    """**동의했다는 사실이 남아야 한다.** 남지 않으면 나중에 확인할 방법이 없다."""
    crimes, accounts = FakeCrimes(), FakeAccounts()
    body = MeUpdateIn(crime_category="property", crime_consent_agreed=True)

    update_me(body, _request(crimes, accounts), ACCOUNT)  # type: ignore[arg-type]

    assert [(c.kind, c.agreed) for c in accounts.consents] == [("crime", True)]


def test_value_without_consent_is_refused() -> None:
    """동의 없이 저장하는 길이 하나라도 열려 있으면 §9.5는 지켜지지 않는다."""
    crimes, accounts = FakeCrimes(), FakeAccounts()
    body = MeUpdateIn(crime_category="property")

    with pytest.raises(HTTPException) as raised:
        update_me(body, _request(crimes, accounts), ACCOUNT)  # type: ignore[arg-type]

    assert raised.value.status_code == 400
    assert crimes.stored == {}
    assert accounts.consents == []


def test_unknown_category_is_refused() -> None:
    with pytest.raises(ValueError):
        MeUpdateIn(crime_category="아무거나", crime_consent_agreed=True)


def test_revoking_needs_no_new_consent() -> None:
    """철회는 권리다. 다시 동의를 받는 절차를 끼워 넣지 않는다 (§9.5)."""
    crimes, accounts = FakeCrimes(), FakeAccounts()
    crimes.stored[ACCOUNT.id] = "property"

    out = update_me(
        MeUpdateIn(crime_category_revoked=True),
        _request(crimes, accounts),  # type: ignore[arg-type]
        ACCOUNT,
    )

    assert crimes.stored == {}
    assert accounts.consents == []
    assert out.has_crime_category is False


def test_revoking_wins_over_a_value_in_the_same_request() -> None:
    """둘 다 오면 지우는 쪽을 따른다. 지우겠다는 뜻을 저장으로 뒤집지 않는다."""
    crimes, accounts = FakeCrimes(), FakeAccounts()
    crimes.stored[ACCOUNT.id] = "property"

    update_me(
        MeUpdateIn(
            crime_category_revoked=True,
            crime_category="other",
            crime_consent_agreed=True,
        ),
        _request(crimes, accounts),  # type: ignore[arg-type]
        ACCOUNT,
    )

    assert crimes.stored == {}


def test_nothing_to_change_is_not_an_error() -> None:
    """화면이 빈 요청을 보내는 경우가 있다. 지금 상태를 그대로 돌려준다."""
    crimes, accounts = FakeCrimes(), FakeAccounts()

    out = update_me(MeUpdateIn(), _request(crimes, accounts), ACCOUNT)  # type: ignore[arg-type]

    assert out.has_crime_category is False
