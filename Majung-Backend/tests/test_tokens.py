"""세션 토큰 — 기획서 §2.4."""

from datetime import timedelta
from uuid import uuid4

from app.domains.account.domain.entity import Session
from app.domains.account.domain.tokens import (
    SESSION_DAYS,
    expires_at,
    hash_token,
    new_token,
    utcnow,
    verify_token,
)


def test_tokens_are_unique() -> None:
    assert len({new_token() for _ in range(200)}) == 200


def test_hash_does_not_contain_the_token() -> None:
    """서버에는 해시만 남는다 — DB가 유출돼도 세션을 탈취당하지 않는다."""
    token = new_token()
    assert token not in hash_token(token)


def test_verify_matches_only_the_right_token() -> None:
    token = new_token()
    stored = hash_token(token)
    assert verify_token(token, stored)
    assert not verify_token(new_token(), stored)


def test_expiry_is_within_retention() -> None:
    """세션 만료는 보관 기간(마지막 접속일 +1년)보다 짧아야 한다."""
    assert 0 < SESSION_DAYS < 365


def test_expired_session_is_invalid() -> None:
    now = utcnow()
    assert Session(uuid4(), expires_at(now)).is_valid(now)
    assert not Session(uuid4(), now - timedelta(seconds=1)).is_valid(now)
