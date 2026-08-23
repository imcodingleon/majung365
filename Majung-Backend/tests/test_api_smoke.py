"""앱 조립·기본 엔드포인트 스모크 (실제 Claude 호출 없음)."""

from fastapi.testclient import TestClient

from app.main import create_app

client = TestClient(create_app())


def test_health() -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    # 키·비밀 미노출
    assert "key" not in r.text.lower()


def test_centers_list() -> None:
    r = client.get("/api/centers")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list) and body
    assert {"name", "lat", "lng", "phone"} <= set(body[0].keys())


def test_centers_category_filter() -> None:
    r = client.get("/api/centers", params={"category": "법무보호공단"})
    assert r.status_code == 200
    assert all(c["category"] == "법무보호공단" for c in r.json())


def test_gate_endpoint_exists() -> None:
    # 게이트 비활성(테스트 env엔 해시 없음)이면 어떤 코드든 토큰 발급
    r = client.post("/api/gate", json={"code": "anything"})
    assert r.status_code == 200
    assert "token" in r.json()


def test_chat_blank_message_rejected() -> None:
    # 공백만 입력 → strip 후 빈 문자열 → 400 (Claude 호출 안 함)
    r = client.post("/api/chat", json={"message": "   "})
    assert r.status_code == 400


def test_cors_preflight_passes_for_every_method_we_use() -> None:
    """**여기가 늦으면 브라우저에서만 막힌다.**

    curl로는 되는데 화면에서만 preflight가 400이라 원인을 찾기 어렵다. 실제로
    PATCH를 쓰는 경로를 넷 만들어 두고 CORS는 GET·POST만 열어 둔 적이 있다.

    앱 내부를 뒤지지 않고 **브라우저가 보내는 것과 같은 요청**을 보낸다.
    """
    origin = "http://localhost:8081"
    for method, path in (
        ("GET", "/api/centers"),
        ("POST", "/api/signup"),
        ("PATCH", "/api/me"),
        ("PATCH", "/api/staff/visits/00000000-0000-0000-0000-000000000000"),
        ("DELETE", "/api/me"),
    ):
        r = client.options(
            path,
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        assert r.status_code == 200, f"{method} {path} preflight 실패({r.status_code})"
        assert r.headers.get("access-control-allow-origin") == origin


def test_cors_refuses_unknown_origin() -> None:
    """localhost만 연다. 다른 사이트가 사용자 브라우저를 빌려 부르지 못하게 한다."""
    r = client.options(
        "/api/signup",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert r.headers.get("access-control-allow-origin") != "https://evil.example.com"
