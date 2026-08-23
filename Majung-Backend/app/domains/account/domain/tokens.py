"""세션 토큰 — 순수 Python (Domain).

기획서 §2.4. 가입을 마치면 서버가 세션 토큰을 발급하고 앱이 `expo-secure-store`에
보관한다. 이메일·비밀번호 로그인이 아니라 **기기 세션**이다.

토큰은 서버가 만들고, **서버에는 해시만 남긴다.** 원문을 저장하면 DB 유출이 곧
전 계정 탈취가 된다.
"""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

# 128비트면 추측으로 맞힐 수 없다. URL-safe라 헤더에 그대로 실린다.
_TOKEN_BYTES = 32

# 만료. 이 사용자층은 앱을 자주 열지 않을 수 있어 짧게 잡으면 27문항을 다시 답하게 된다.
# 보관 기간(마지막 접속일 +1년)보다는 짧아야 하므로 그 사이에서 잡는다.
SESSION_DAYS = 90


def new_token() -> str:
    """새 세션 토큰. 이 값은 딱 한 번, 발급 응답으로만 나간다."""
    return secrets.token_urlsafe(_TOKEN_BYTES)


def hash_token(token: str) -> str:
    """저장용 해시.

    비밀번호가 아니라 고엔트로피 난수라 느린 해시(bcrypt 등)가 필요 없다 —
    사전 공격의 대상이 되지 않는다. 조회할 때마다 계산하므로 빠른 편이 낫다.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_token(token: str, stored_hash: str) -> bool:
    """비교는 상수 시간으로. 타이밍으로 해시를 좁혀 나가는 길을 막는다."""
    return hmac.compare_digest(hash_token(token), stored_hash)


def expires_at(now: datetime) -> datetime:
    return now + timedelta(days=SESSION_DAYS)


def utcnow() -> datetime:
    return datetime.now(UTC)
