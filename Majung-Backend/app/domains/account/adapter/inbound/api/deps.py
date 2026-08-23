"""세션 인증 의존성 — 요청이 누구의 것인지 가린다.

기획서 §2.4. 가입을 마치면 발급된 토큰을 앱이 `expo-secure-store`에 보관하고
`Authorization: Bearer <token>`으로 보낸다.

**저장 기능이 꺼져 있으면 인증을 건너뛴다.** DB 설정이 없는 로컬·데모에서는
세션을 확인할 방법 자체가 없는데, 그때 전부 막으면 개발이 안 된다. 대신 부팅
로그가 경고하고, 저장이 켜지는 순간 검증이 시작된다.

여기서 마지막 접속일도 갱신한다(§9.4 보관 기간). **하루 한 번만 쓴다** —
매 요청마다 쓰면 읽기만 하는 화면에서도 쓰기가 생긴다.
"""

import logging
from datetime import date

from fastapi import Header, HTTPException, Request

from app.domains.account.domain.entity import Account
from app.domains.shared.clock import today_kst

logger = logging.getLogger("majung.account")


def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def current_account(
    request: Request,
    authorization: str | None = Header(default=None),
) -> Account | None:
    """세션 토큰으로 사용자를 찾는다. 저장이 꺼져 있거나 토큰이 없으면 None.

    **None을 예외로 만들지 않는다.** 로그인 없이도 쓸 수 있는 화면이 있고(제도 조회),
    가입 전에 챗을 열어보는 흐름도 막지 않는다. 사용자별 데이터가 필요한 곳에서만
    require_account로 막는다.
    """
    sessions = getattr(request.app.state, "session_repo", None)
    accounts = getattr(request.app.state, "account_repo", None)
    if sessions is None or accounts is None:
        return None

    token = _bearer(authorization)
    if not token:
        return None

    # **한국의 오늘이다.** UTC 날짜로 세면 새벽에 접속한 사람이
    # 전날 접속한 것으로 기록된다(shared/clock.py 참고).
    today = today_kst()
    session = sessions.resolve(token, today)
    if session is None:
        return None

    account = accounts.by_id(session.user_id)
    # app.state는 타입이 없어 Any로 온다. 여기서 한 번 좁혀 바깥으로 Any가 새지 않게 한다.
    if not isinstance(account, Account):
        return None

    if account.last_seen_on != today:
        # 하루 한 번. 실패해도 요청은 진행한다 — 접속일 갱신이 안 됐다고
        # 사용자가 쓰던 화면이 멈출 이유가 없다.
        try:
            accounts.touch(account.id, today)
        except Exception:
            logger.warning("마지막 접속일 갱신 실패")
    return account


def require_account(
    request: Request,
    authorization: str | None = Header(default=None),
) -> Account:
    """사용자별 데이터를 다루는 곳에서 쓴다. 내 정보 조회·수정·삭제가 그렇다.

    저장이 꺼져 있으면 503이다 — 401이 아니다. 사용자가 뭔가 잘못한 것이 아니라
    서버가 그 기능을 제공할 상태가 아니기 때문이다.
    """
    if getattr(request.app.state, "session_repo", None) is None:
        raise HTTPException(
            status_code=503, detail="지금은 이용할 수 없어요. 잠시 후 다시 시도해 주세요."
        )
    account = current_account(request, authorization)
    if account is None:
        raise HTTPException(status_code=401, detail="다시 로그인해 주세요.")
    return account
