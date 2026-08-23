"""컬럼 단위 암호화 — 저장하는 식별정보를 앱에서 암호화한다.

기획서 §9.2. **키는 애플리케이션 코드·레포지토리와 분리 보관한다.**

`pgcrypto`를 쓰지 않는 이유가 여기 있다. DB 안에서 암·복호화하면 키가 DB 안에
있게 되고, **DB가 뚫렸을 때 암호문만 나가야 한다**는 전제가 무너진다. 백업 덤프가
유출되는 경우도 마찬가지다.

이 서비스에서 유출이 뜻하는 것은 다른 서비스와 다르다. 출소 사실이 드러나면
그분의 사회 복귀가 무너진다. 그래서 편의와 보안이 충돌하면 보안을 택한다.

무엇을 암호화하나 (§9.1)
- 죄목 — 민감정보 준용. 별도 테이블 + 컬럼 암호화
- 이름·생일·출소날짜 — 고민감 식별정보. 컬럼 암호화
- 서류 체크·완료 여부·동의 이력 — 평문 가능
"""

import base64
import os
from dataclasses import dataclass

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# AES-256이므로 32바이트. GCM 논스는 12바이트가 표준이다.
_KEY_BYTES = 32
_NONCE_BYTES = 12


class CryptoError(Exception):
    """암·복호화가 제 역할을 못 했다. 이 예외가 나면 평문으로 넘어가지 않는다."""


@dataclass(frozen=True)
class FieldCipher:
    """컬럼 하나를 암호화하는 도구.

    같은 평문이라도 매번 다른 암호문이 나온다(논스가 매번 새로 생긴다). 그래서
    **암호화된 컬럼으로는 검색도 정렬도 할 수 없다.** 이름으로 사용자를 찾아야 하는
    기능은 이 구조에서 만들 수 없고, 그건 의도한 제약이다.
    """

    key: bytes

    def __post_init__(self) -> None:
        if len(self.key) != _KEY_BYTES:
            raise CryptoError(f"키는 {_KEY_BYTES}바이트여야 한다")

    def encrypt(self, plaintext: str) -> str:
        """암호문을 base64 문자열로. 논스를 앞에 붙여 한 값으로 저장한다."""
        if plaintext is None:
            raise CryptoError("빈 값을 암호화할 수 없다")
        nonce = os.urandom(_NONCE_BYTES)
        sealed = AESGCM(self.key).encrypt(nonce, plaintext.encode("utf-8"), None)
        return base64.b64encode(nonce + sealed).decode("ascii")

    def decrypt(self, stored: str) -> str:
        """복호화. 변조되었거나 다른 키로 암호화된 값이면 예외를 낸다 —
        GCM이 무결성까지 검사하므로 조용히 깨진 평문이 나오는 일은 없다."""
        try:
            raw = base64.b64decode(stored.encode("ascii"))
            nonce, sealed = raw[:_NONCE_BYTES], raw[_NONCE_BYTES:]
            return AESGCM(self.key).decrypt(nonce, sealed, None).decode("utf-8")
        except (InvalidTag, ValueError, TypeError) as exc:
            # 원문도 키도 예외 메시지에 담지 않는다 — 로그로 흘러간다.
            raise CryptoError("복호화에 실패했다") from exc


def load_key(encoded: str) -> bytes:
    """환경변수의 base64 키를 읽는다.

    **키를 코드나 레포지토리에 두지 않는다.** 없으면 예외를 내고 부팅을 멈춘다 —
    키가 없다고 평문으로 저장하는 폴백은 두지 않는다. 그 폴백이 있으면 설정 하나
    빠뜨렸을 때 조용히 평문 DB가 만들어진다.
    """
    if not encoded:
        raise CryptoError(
            "암호화 키가 없다. FIELD_ENCRYPTION_KEY를 환경변수로 설정하라 "
            "(base64로 인코딩한 32바이트)"
        )
    try:
        key = base64.b64decode(encoded.encode("ascii"))
    except (ValueError, TypeError) as exc:
        raise CryptoError("암호화 키가 base64 형식이 아니다") from exc
    if len(key) != _KEY_BYTES:
        raise CryptoError(f"암호화 키는 {_KEY_BYTES}바이트여야 한다 (지금 {len(key)}바이트)")
    return key


def generate_key() -> str:
    """새 키를 만든다. 운영에 쓸 키는 이 함수로 만들어 환경변수에 넣는다.

        uv run python -c "from app.infrastructure.security import crypto;
                          print(crypto.generate_key())"

    **키를 바꾸면 기존 데이터를 읽을 수 없다.** 교체하려면 옛 키로 읽어 새 키로 다시
    쓰는 과정이 필요하다.
    """
    return base64.b64encode(os.urandom(_KEY_BYTES)).decode("ascii")
