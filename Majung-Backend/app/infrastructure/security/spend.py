"""지출 서킷브레이커 (남용 방어 ③, 백스톱) — 시간·일 Claude 호출 총량 상한.

게이트가 뚫려도 하루 비용이 상한에 묶이도록. 예선은 인메모리 카운터(단일 프로세스),
본선은 Redis로 교체. 대화 내용은 세지 않고 '호출 횟수'만 센다(개인정보 아님).
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

    def allow(self) -> bool:
        """상한 내이면 카운트 올리고 True. 초과면 카운트 그대로 False."""
        now = time.monotonic()
        with self._lock:
            self._roll(now)
            if self._hour_count >= self._max_hour or self._day_count >= self._max_day:
                return False
            self._hour_count += 1
            self._day_count += 1
            return True
