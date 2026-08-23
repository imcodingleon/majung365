"""담당자 세션 토큰 — 순수 Python (Domain).

출소자 세션과 같은 방식이되 **만료가 훨씬 짧다.**

§8.2가 "담당자 기기가 공용일 가능성을 전제한다"고 못박고 있다. 관리자 앱은 정의상
출소자 명단을 만들기 때문에, 자리를 비운 사이 그 명단이 열려 있으면 안 된다.
"""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

_TOKEN_BYTES = 32

# 담당자 세션 만료. 출소자(90일)와 달리 업무 시간 단위로 잡는다 —
# 공용 기기에서 자리를 비웠을 때 명단이 열려 있는 시간을 줄이는 것이 목적이다.
SESSION_HOURS = 8


def new_token() -> str:
    return secrets.token_urlsafe(_TOKEN_BYTES)


def hash_token(token: str) -> str:
    """고엔트로피 난수라 빠른 해시로 충분하다 — 사전 공격의 대상이 아니다.
    사람이 정한 비밀번호에 scrypt를 쓰는 것과 구분한다."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_token(token: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_token(token), stored_hash)


def expires_at(now: datetime) -> datetime:
    return now + timedelta(hours=SESSION_HOURS)
