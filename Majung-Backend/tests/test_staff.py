"""담당자 계정 — 기획서 §8.2.

관리자 앱은 정의상 "출소자 명단"을 만든다. 그래서 §8.2가 접근 통제·감사 로그·
자동 로그아웃을 기능이 아니라 **전제 조건**으로 다룬다.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.domains.shared.routes import RouteId
from app.domains.staff.domain.credentials import hash_password, verify_password
from app.domains.staff.domain.entity import OrgKind, StaffSession, org_for
from app.domains.staff.domain.tokens import (
    SESSION_HOURS,
    expires_at,
    hash_token,
    new_token,
    verify_token,
)

# ── 비밀번호 ──


def test_password_hash_hides_the_password() -> None:
    assert "admin1234" not in hash_password("admin1234")


def test_same_password_gives_different_hash() -> None:
    """소금이 매번 새로 생긴다. 같은 비밀번호를 쓰는 두 계정이 한눈에 드러나면 안 된다."""
    assert hash_password("admin1234") != hash_password("admin1234")


def test_password_verifies() -> None:
    stored = hash_password("admin1234")
    assert verify_password("admin1234", stored)
    assert not verify_password("admin12345", stored)
    assert not verify_password("", stored)


def test_broken_hash_returns_false_not_raises() -> None:
    """형식이 깨진 값에 예외를 내면 그 자체가 신호가 된다."""
    for bad in ("garbage", "scrypt$bad", "", "md5$1$2$3$4$5"):
        assert verify_password("admin1234", bad) is False


def test_password_hash_is_slow_enough() -> None:
    """사람이 정한 비밀번호는 사전 공격의 대상이다. DB가 유출됐을 때
    admin1234가 몇 초 만에 복원되면 안 된다."""
    import time

    start = time.perf_counter()
    hash_password("admin1234")
    assert time.perf_counter() - start > 0.05, "너무 빠르면 무차별 대입에 약하다"


# ── 세션 ──


def test_staff_session_expires_within_a_workday() -> None:
    """담당자 기기가 공용일 가능성을 전제한다(§8.2). 자리를 비운 사이 명단이
    열려 있으면 안 되므로 출소자 세션(90일)과 다른 기준을 쓴다."""
    assert 0 < SESSION_HOURS <= 24


def test_staff_token_hash_hides_the_token() -> None:
    token = new_token()
    assert token not in hash_token(token)
    assert verify_token(token, hash_token(token))
    assert not verify_token(new_token(), hash_token(token))


def test_expired_session_is_invalid() -> None:
    now = datetime.now(UTC)
    assert StaffSession(uuid4(), expires_at(now)).is_valid(now)
    assert not StaffSession(uuid4(), now - timedelta(seconds=1)).is_valid(now)


# ── 항목별 담당 기관 ──


def test_koreha_routes_go_to_koreha() -> None:
    for route in (RouteId.R1, RouteId.R2, RouteId.R4, RouteId.R6, RouteId.R8):
        assert org_for(route) == OrgKind.KOREHA


def test_administrative_routes_go_to_center() -> None:
    for route in (RouteId.R9, RouteId.R11, RouteId.R12, RouteId.R15):
        assert org_for(route) == OrgKind.CENTER


def test_routes_without_our_staff_have_no_org() -> None:
    """통장은 은행, 증명서는 교정시설, 채무는 법원이라 우리 담당자가 없다 —
    방문 요청을 받을 곳이 없다는 뜻이다."""
    for route in (RouteId.R10, RouteId.R13, RouteId.R14):
        assert org_for(route) is None


def test_every_route_is_decided() -> None:
    """새 항목이 생겼는데 담당 기관을 정하지 않으면 방문 요청이 갈 곳을 잃는다."""
    from app.domains.staff.domain.entity import ROUTE_ORG

    undecided = [r.value for r in RouteId if r not in ROUTE_ORG]
    assert undecided == ["R10", "R13", "R14"], f"판단이 필요한 항목: {undecided}"


# ── 로그인 응답 ──


@pytest.fixture
def client():  # type: ignore[no-untyped-def]
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


def test_login_does_not_reveal_whether_the_id_exists(client) -> None:  # type: ignore[no-untyped-def]
    """구분해 알리면 존재하는 아이디를 찾아내는 길이 된다."""
    with client:
        wrong_pw = client.post(
            "/api/staff/login", json={"login_id": "admin1", "password": "wrong"}
        )
        no_such = client.post(
            "/api/staff/login", json={"login_id": "nobody-here", "password": "wrong"}
        )
    assert wrong_pw.status_code == no_such.status_code == 401
    assert wrong_pw.json() == no_such.json()


def test_staff_endpoint_rejects_anonymous(client) -> None:  # type: ignore[no-untyped-def]
    with client:
        assert client.get("/api/staff/me").status_code == 401
