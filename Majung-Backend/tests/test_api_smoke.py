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
