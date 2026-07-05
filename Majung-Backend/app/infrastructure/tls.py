"""Windows OpenSSL applink 크래시 우회.

uv의 python-build-standalone 배포에서 `ssl.create_default_context()`가
`OPENSSL_Uplink ... no OPENSSL_Applink`로 프로세스를 죽인다(httpx/anthropic 클라이언트 생성 시).
수동으로 SSLContext를 구성하면(= load_default_certs 경로) 크래시가 발생하지 않는다.
이 컨텍스트를 담은 httpx 클라이언트를 외부 SDK에 주입한다.
"""

import ssl

import httpx


def safe_ssl_context() -> ssl.SSLContext:
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = True
    ctx.verify_mode = ssl.CERT_REQUIRED
    ctx.load_default_certs()  # OS 루트 저장소 — create_default_context()의 크래시 경로를 피한다
    return ctx


def make_async_http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(verify=safe_ssl_context())
