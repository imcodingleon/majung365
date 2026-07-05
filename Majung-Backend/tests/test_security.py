"""게이트·지출 서킷브레이커."""

import hashlib

import pytest

from app.infrastructure.config.settings import Settings
from app.infrastructure.security.gate import AccessGate
from app.infrastructure.security.spend import SpendCircuitBreaker
from app.main import _assert_gate_safe


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
    # 위조·손상 토큰은 예외 없이 False (BadData 계열 전부 포착)
    assert gate.verify_token("위조된.토큰.값") is False
    assert gate.verify_token("garbage") is False
    assert gate.verify_token("a.b.c.d.e") is False


def test_gate_disabled_when_no_hash() -> None:
    gate = AccessGate(Settings(demo_access_code_hash="", session_secret="x"))
    assert gate.enabled is False
    # 비활성이면 통과(로컬 개발)
    assert gate.verify_code("아무거나") is True
    assert gate.verify_token(None) is True


def test_spend_breaker_check_and_record() -> None:
    breaker = SpendCircuitBreaker(max_per_hour=2, max_per_day=100)
    assert breaker.check() is True  # 읽기 전용 — 카운트 안 올림
    assert breaker.check() is True
    breaker.record()
    breaker.record()
    assert breaker.check() is False  # 2콜 기록 후 시간 상한 도달


def test_spend_breaker_daily_limit() -> None:
    breaker = SpendCircuitBreaker(max_per_hour=100, max_per_day=1)
    assert breaker.check() is True
    breaker.record()
    assert breaker.check() is False  # 일 상한 도달


def test_boot_guard_rejects_default_secret_when_gate_enabled() -> None:
    # 게이트 활성 + 공개 기본 SESSION_SECRET → 토큰 위조 가능 → 기동 거부
    digest = hashlib.sha256("코드".encode()).hexdigest()
    settings = Settings(demo_access_code_hash=digest, session_secret="dev-only-secret-change-me")
    with pytest.raises(RuntimeError):
        _assert_gate_safe(AccessGate(settings), settings)


def test_boot_guard_ok_with_real_secret() -> None:
    digest = hashlib.sha256("코드".encode()).hexdigest()
    settings = Settings(demo_access_code_hash=digest, session_secret="a-real-random-secret")
    _assert_gate_safe(AccessGate(settings), settings)  # 예외 없어야 함


def test_boot_guard_warns_but_allows_when_gate_disabled() -> None:
    settings = Settings(demo_access_code_hash="", session_secret="dev-only-secret-change-me")
    _assert_gate_safe(AccessGate(settings), settings)  # 비활성이면 경고만, 예외 없음
