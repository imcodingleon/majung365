"""Rate limit (남용 방어 ②) — slowapi Limiter.

키는 클라이언트 IP. 프록시(AWS ALB 등) 뒤에서는 request.client.host가 프록시 IP라
모든 사용자가 한 버킷으로 묶이므로, X-Forwarded-For의 최좌측(원 클라이언트)을 우선 사용.
주의: X-Forwarded-For는 신뢰된 프록시가 덮어쓸 때만 신뢰 가능(직접 노출 시 스푸핑 가능).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return get_remote_address(request)


limiter = Limiter(key_func=client_ip)
