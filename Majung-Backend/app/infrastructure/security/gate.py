"""접근 게이트 (남용 방어 ①) — 데모 코드 검증 + 단기 서명 토큰.

- 평문 코드는 저장하지 않는다. env의 sha256 해시와 상수시간 비교.
- 통과 시 만료가 있는 서명 토큰 발급. /api/chat은 이 토큰을 요구한다.
- 신원 수집 0 (익명 공유 코드일 뿐, 계정 아님).
"""

import hashlib
import hmac
import logging

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.infrastructure.config.settings import Settings

logger = logging.getLogger("majung.gate")

_SALT = "majung-gate-v1"


class AccessGate:
    def __init__(self, settings: Settings) -> None:
        self._code_hash = settings.demo_access_code_hash.strip().lower()
        self._ttl = settings.session_ttl_seconds
        self._serializer = URLSafeTimedSerializer(settings.session_secret, salt=_SALT)

    @property
    def enabled(self) -> bool:
        # 해시 미설정이면 게이트 비활성(로컬 개발). 배포 전 반드시 설정.
        return bool(self._code_hash)

    def verify_code(self, code: str) -> bool:
        if not self.enabled:
            return True
        digest = hashlib.sha256(code.encode("utf-8")).hexdigest()
        return hmac.compare_digest(digest, self._code_hash)

    def issue_token(self) -> str:
        return self._serializer.dumps({"ok": True})

    def verify_token(self, token: str | None) -> bool:
        if not self.enabled:
            return True
        if not token:
            return False
        try:
            self._serializer.loads(token, max_age=self._ttl)
            return True
        except SignatureExpired:
            return False
        except BadSignature:
            return False
