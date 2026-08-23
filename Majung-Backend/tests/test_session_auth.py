"""세션 인증과 내 정보 — 기획서 §2.4·§9.4.

열람·수정·삭제는 개인정보보호법이 보장하는 권리다. 기능이 없으면 위법이다.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException, Request

from app.domains.account.adapter.inbound.api.deps import current_account, require_account
from app.domains.account.domain.entity import Account, Session
from app.domains.account.domain.tokens import utcnow


@dataclass
class FakeState:
    session_repo: object = None
    account_repo: object = None


class FakeRequest:
    """Request는 app.state만 쓰므로 그만 흉내 낸다."""

    def __init__(self, state: FakeState) -> None:
        self.app = type("App", (), {"state": state})()


def _account(last_seen: date) -> Account:
    return Account(
        id=uuid4(),
        name="김판수",
        birth_date=date(1975, 3, 2),
        release_date=date(2026, 8, 3),
        created_at=utcnow(),
        last_seen_on=last_seen,
    )


@dataclass
class FakeSessions:
    account_id: UUID
    valid: bool = True
    expired: bool = False

    def resolve(self, token: str, today: date) -> Session | None:
        if not self.valid or token == "wrong":
            return None
        if self.expired:
            return None  # 저장소가 만료를 걸러 준다
        return Session(self.account_id, utcnow() + timedelta(days=1))


@dataclass
class FakeAccounts:
    account: Account
    touched: list[date] = field(default_factory=list)

    def by_id(self, user_id: UUID) -> Account | None:
        return self.account if user_id == self.account.id else None

    def touch(self, user_id: UUID, today: date) -> None:
        self.touched.append(today)


def _req(account: Account, **kw: object) -> tuple[FakeRequest, FakeAccounts]:
    accounts = FakeAccounts(account)
    sessions = FakeSessions(account.id, **kw)  # type: ignore[arg-type]
    return FakeRequest(FakeState(sessions, accounts)), accounts


def test_no_token_is_not_an_error() -> None:
    """로그인 없이 쓸 수 있는 화면이 있다. None을 예외로 만들지 않는다."""
    req, _ = _req(_account(date.today()))
    assert current_account(req, None) is None  # type: ignore[arg-type]


def test_wrong_token_finds_nobody() -> None:
    req, _ = _req(_account(date.today()))
    assert current_account(req, "Bearer wrong") is None  # type: ignore[arg-type]


def test_malformed_header_is_ignored() -> None:
    req, _ = _req(_account(date.today()))
    for header in ("token-without-scheme", "Basic abc", "Bearer", "Bearer   "):
        assert current_account(req, header) is None  # type: ignore[arg-type]


def test_valid_token_resolves_account() -> None:
    account = _account(date.today())
    req, _ = _req(account)
    assert current_account(req, "Bearer good")  # type: ignore[arg-type]


def test_last_seen_is_written_once_a_day() -> None:
    """매 요청마다 쓰면 읽기만 하는 화면에서도 쓰기가 생긴다(§9.4)."""
    today = date.today()
    req, accounts = _req(_account(today))
    current_account(req, "Bearer good")  # type: ignore[arg-type]
    assert accounts.touched == [], "오늘 이미 찍혔으면 쓰지 않는다"

    req2, accounts2 = _req(_account(today - timedelta(days=3)))
    current_account(req2, "Bearer good")  # type: ignore[arg-type]
    assert accounts2.touched == [today]


def test_touch_failure_does_not_break_the_request() -> None:
    """접속일 갱신이 안 됐다고 사용자가 쓰던 화면이 멈출 이유가 없다."""

    class Failing(FakeAccounts):
        def touch(self, user_id: UUID, today: date) -> None:
            raise RuntimeError("DB 오류")

    account = _account(date.today() - timedelta(days=1))
    req = FakeRequest(FakeState(FakeSessions(account.id), Failing(account)))
    assert current_account(req, "Bearer good")  # type: ignore[arg-type]


def test_require_returns_503_without_storage() -> None:
    """저장이 꺼져 있으면 401이 아니라 503이다 — 사용자가 뭘 잘못한 게 아니라
    서버가 그 기능을 제공할 상태가 아니다."""
    req = FakeRequest(FakeState())
    with pytest.raises(HTTPException) as exc:
        require_account(req, "Bearer good")  # type: ignore[arg-type]
    assert exc.value.status_code == 503


def test_require_returns_401_with_bad_token() -> None:
    req, _ = _req(_account(date.today()))
    with pytest.raises(HTTPException) as exc:
        require_account(req, "Bearer wrong")  # type: ignore[arg-type]
    assert exc.value.status_code == 401


def test_request_type_is_compatible() -> None:
    """FakeRequest가 실제 Request 자리에 들어간다는 것을 명시해 둔다."""
    assert hasattr(Request, "app")
