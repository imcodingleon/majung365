"""지출 서킷브레이커 (남용 방어 ③, 백스톱) — 시간·일 Claude '호출' 총량 상한.

게이트가 뚫려도 하루 비용이 상한에 묶이도록. 예선은 인메모리 카운터(단일 인스턴스),
본선/스케일아웃 시 Redis로 교체(멀티 인스턴스에서 인메모리는 무력).
대화 내용은 세지 않고 '호출 횟수'만 센다(개인정보 아님).

check()는 스트림 시작 전 읽기 전용 판정(429 조기 차단), record()는 실제 Claude 호출마다 증가.
1턴 = triage 1콜 + guidance 1콜(+ daily면 web_search 서버툴 라운드트립) → 콜 단위로 세야 정확.
"""

import threading
import time


class SpendCircuitBreaker:
    def __init__(self, max_per_hour: int, max_per_day: int) -> None:
        self._max_hour = max_per_hour
        self._max_day = max_per_day
        self._hour_count = 0
        self._day_count = 0
        self._hour_start = time.monotonic()
        self._day_start = time.monotonic()
        self._lock = threading.Lock()

    def _roll(self, now: float) -> None:
        if now - self._hour_start >= 3600:
            self._hour_count = 0
            self._hour_start = now
        if now - self._day_start >= 86400:
            self._day_count = 0
            self._day_start = now

    def check(self) -> bool:
        """현재 상한 이내인가(읽기 전용). 스트림 시작 전 조기 429용."""
        now = time.monotonic()
        with self._lock:
            self._roll(now)
            return self._hour_count < self._max_hour and self._day_count < self._max_day

    def record(self) -> None:
        """실제 Claude 호출 1건 기록. 호출부(클라이언트)에서 매 호출마다 호출."""
        now = time.monotonic()
        with self._lock:
            self._roll(now)
            self._hour_count += 1
            self._day_count += 1
