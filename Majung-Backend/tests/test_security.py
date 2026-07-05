"""게이트·지출 서킷브레이커."""

import hashlib

from app.infrastructure.config.settings import Settings
from app.infrastructure.security.gate import AccessGate
from app.infrastructure.security.spend import SpendCircuitBreaker


def _gate(code: str) -> AccessGate:
    digest = hashlib.sha256(code.encode()).hexdigest()
    settings = Settings(demo_access_code_hash=digest, session_secret="test-secret")
    return AccessGate(settings)


def test_gate_code_correct_and_wrong() -> None:
    gate = _gate("마중데모2026")
    assert gate.enabled is True
    assert gate.verify_code("마중데모2026") is True
    assert gate.verify_code("틀린코드") is False


def test_gate_token_roundtrip() -> None:
    gate = _gate("코드")
    token = gate.issue_token()
    assert gate.verify_token(token) is True
    assert gate.verify_token(None) is False
    assert gate.verify_token("위조된.토큰.값") is False


def test_gate_disabled_when_no_hash() -> None:
    gate = AccessGate(Settings(demo_access_code_hash="", session_secret="x"))
    assert gate.enabled is False
    # 비활성이면 통과(로컬 개발)
    assert gate.verify_code("아무거나") is True
    assert gate.verify_token(None) is True


def test_spend_breaker_blocks_over_limit() -> None:
    breaker = SpendCircuitBreaker(max_per_hour=2, max_per_day=100)
    assert breaker.allow() is True
    assert breaker.allow() is True
    assert breaker.allow() is False  # 시간 상한 초과


def test_spend_breaker_daily_limit() -> None:
    breaker = SpendCircuitBreaker(max_per_hour=100, max_per_day=1)
    assert breaker.allow() is True
    assert breaker.allow() is False  # 일 상한 초과
