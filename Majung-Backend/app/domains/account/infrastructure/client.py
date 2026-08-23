"""Supabase 클라이언트 생성 (Infrastructure).

**설정이 비어 있으면 만들지 않는다.** 저장 기능이 없는 상태로 서버가 뜨는 것은
괜찮지만, 키가 없는데 평문으로 저장하거나 조용히 동작하는 것은 안 된다(§9.2).

Windows에서 SSL 컨텍스트를 SDK에 맡기면 프로세스가 죽는다(tls.py 참조).
supabase-py는 httpx 클라이언트를 주입받으므로 같은 우회를 쓴다.
"""

from supabase import Client, ClientOptions, create_client

from app.infrastructure.config.settings import Settings
from app.infrastructure.security.crypto import FieldCipher, load_key
from app.infrastructure.tls import make_sync_http_client


def make_supabase_client(settings: Settings) -> Client | None:
    """설정이 갖춰졌을 때만 클라이언트를 만든다. 없으면 None — 저장 기능이 꺼진다."""
    if not settings.supabase_url or not settings.supabase_service_key:
        return None
    return create_client(
        settings.supabase_url,
        settings.supabase_service_key,
        options=ClientOptions(httpx_client=make_sync_http_client()),
    )


def make_field_cipher(settings: Settings) -> FieldCipher:
    """암호화 키를 읽는다. 없으면 예외 — 평문 저장 폴백은 두지 않는다."""
    return FieldCipher(load_key(settings.field_encryption_key))
