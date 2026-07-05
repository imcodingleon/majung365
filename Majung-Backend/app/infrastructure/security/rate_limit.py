"""Rate limit (남용 방어 ②, 느슨) — slowapi Limiter. IP 기준 인메모리."""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
