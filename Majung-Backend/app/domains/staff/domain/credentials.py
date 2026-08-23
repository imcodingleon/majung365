"""담당자 비밀번호 — 순수 Python (Domain).

**세션 토큰과 다른 해시를 쓴다.** 토큰은 고엔트로피 난수라 sha256으로 충분하지만,
사람이 정한 비밀번호는 사전 공격의 대상이라 느린 해시가 필요하다. DB가 유출됐을 때
`admin1234`가 몇 초 만에 복원되면 안 된다.

표준 라이브러리의 scrypt를 쓴다. 의존성을 늘리지 않고도 메모리 하드 함수를 쓸 수
있고, bcrypt·argon2와 달리 패키지가 필요 없다.
"""

import hashlib
import hmac
import secrets

# scrypt 계수. n을 키우면 느려지고 안전해진다.
# 로그인은 드물게 일어나므로 수백 밀리초는 감당할 만하다 —
# 매 요청마다 도는 세션 검증과 달리 이쪽은 하루에 몇 번이다.
_N = 2**15
_R = 8
_P = 1
_SALT_BYTES = 16
_KEY_BYTES = 32

# scrypt가 쓰는 메모리는 128 * n * r 이고, 지금 계수로는 정확히 32MB다.
# OpenSSL의 기본 한도가 그 32MB라 경계에서 거절당한다 — 명시해서 여유를 준다.
_MAXMEM = 128 * _N * _R * 2


def hash_password(password: str) -> str:
    """저장할 형태로. 소금을 함께 담아 한 값으로 둔다 —
    소금을 따로 두면 컬럼이 하나 늘고 짝이 어긋날 여지가 생긴다."""
    salt = secrets.token_bytes(_SALT_BYTES)
    key = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_N,
        r=_R,
        p=_P,
        maxmem=_MAXMEM,
        dklen=_KEY_BYTES,
    )
    return f"scrypt${_N}${_R}${_P}${salt.hex()}${key.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """비교는 상수 시간으로. 타이밍으로 해시를 좁혀 나가는 길을 막는다.

    형식이 깨진 값에는 False를 돌려준다 — 예외를 내면 그 자체가 신호가 된다.
    """
    try:
        scheme, n, r, p, salt_hex, key_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        key = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            # 저장된 계수를 그대로 쓰므로 한도도 그 계수에 맞춰 계산한다 —
            # 나중에 계수를 올려도 옛 해시를 계속 읽을 수 있다.
            maxmem=128 * int(n) * int(r) * 2,
            dklen=len(bytes.fromhex(key_hex)),
        )
        return hmac.compare_digest(key.hex(), key_hex)
    except (ValueError, TypeError):
        return False
