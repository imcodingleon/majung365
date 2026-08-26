"""앱이 여는 메서드와 CORS 허용 목록이 어긋나지 않는가.

**실제로 어긋난 적이 있다.** `PUT /api/tasks/completed`를 만들고 `allow_methods`에
넣지 않아서, 완료를 눌러도 브라우저에서는 한 번도 저장되지 않았다. 사용자에게는
"끝낸 표시를 저장하지 못했어요"만 뜨고 새로고침하면 되살아났다.

**이런 어긋남은 눈에 잘 안 띈다.** curl로는 되고 브라우저에서만 preflight가 400이라,
서버 로그에도 실패한 요청이 아니라 `OPTIONS ... 400` 한 줄만 남는다. 사람이 목록을
기억하는 대신 여기서 센다.
"""

from typing import Any

from fastapi.routing import APIRoute

from app.main import CORS_METHODS, create_app

# preflight 자체는 미들웨어가 처리한다. 라우트가 선언하지 않아도 되는 메서드다.
_NOT_A_ROUTE_METHOD = {"HEAD", "OPTIONS"}

# 자동 생성되는 문서 화면. 우리가 여는 창구가 아니다.
_DOC_PATHS = {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}


def _api_routes() -> list[APIRoute]:
    """앱에 붙은 창구 전부.

    **안쪽까지 훑는다.** 이 FastAPI 판은 `include_router`로 넣은 것을 펼치지 않고
    `_IncludedRouter`로 감싸 둔다. 겉만 보면 창구가 하나로 보인다.
    """
    found: list[APIRoute] = []

    def walk(routes: Any) -> None:
        for route in routes or []:
            if isinstance(route, APIRoute):
                if route.path not in _DOC_PATHS:
                    found.append(route)
                continue
            # `_IncludedRouter`는 원본 라우터를 안에 들고 있다.
            inner = getattr(route, "original_router", None)
            walk(getattr(inner, "routes", None) if inner else getattr(route, "routes", None))

    walk(create_app().routes)
    return found


def _declared_methods() -> set[str]:
    """앱에 실제로 붙어 있는 메서드들."""
    found: set[str] = set()
    for route in _api_routes():
        found |= set(route.methods or set())
    return found - _NOT_A_ROUTE_METHOD


def test_every_route_method_is_allowed() -> None:
    missing = sorted(_declared_methods() - set(CORS_METHODS))
    assert not missing, (
        f"CORS 허용 목록에 없는 메서드로 창구를 열었다: {missing}. "
        "브라우저에서는 preflight가 400으로 막혀 화면에서만 조용히 실패한다."
    )


def test_completed_uses_put() -> None:
    """**이 사고가 난 바로 그 자리다.** 메서드를 바꾸면 여기서 먼저 걸린다."""
    routes = [r for r in _api_routes() if r.path == "/api/tasks/completed"]
    assert routes, "완료 저장 창구가 사라졌다"
    assert "PUT" in (routes[0].methods or set())
    assert "PUT" in CORS_METHODS


def test_no_method_is_opened_without_a_route() -> None:
    """쓰지 않는 메서드를 열어두지 않는다. 여는 것은 실제로 여는 것만이다."""
    unused = sorted(set(CORS_METHODS) - _declared_methods() - _NOT_A_ROUTE_METHOD)
    assert not unused, f"쓰지 않는 메서드가 열려 있다: {unused}"
