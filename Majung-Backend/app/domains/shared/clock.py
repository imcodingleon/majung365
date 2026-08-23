"""날짜와 시각 — 순수 Python (Domain).

**시각은 UTC로 두고 날짜만 한국 기준으로 센다.** 둘을 갈라 두는 이유가 있다.

    시각    저장·비교에 쓴다. UTC가 맞다 — 어디서 읽어도 같은 순간을 가리킨다
    날짜    사람이 "오늘"이라고 부르는 것이다. 한국에 사는 사용자의 오늘이어야 한다

이 구분이 없으면 `date.today()`가 곧 UTC 날짜가 되고, **한국 시각 자정부터 오전
9시까지 서버의 오늘은 어제다.** 실제로 세 가지가 어긋났다.

    가입      한국 날짜로 오늘 출소한 사람이 새벽에 가입하면 "출소날짜를 다시
              확인해 주세요"로 막혔다. 시설 안에서 출소 당일 온보딩하는 것이
              이 서비스의 표준 경로인데(A 쐐기) 그 경로가 새벽에 닫혀 있었다
    경과일    "출소 23일째"가 22일째로 나왔다. 기한이 있는 제도의 판정 입력이다
    하루 상한  UTC 자정에 리셋됐다. 한국 시각 아침에 3건을 채우면 9시에 풀려
              하루 6건이 되고, 밤에 채우면 "내일 이어서 보낼 수 있어요"라고
              안내하고는 다음 날 오전 9시까지 막았다

**새 코드에서 `date.today()`를 부르지 않는다.** 여기 있는 `today_kst()`를 쓴다.
"""

from datetime import UTC, date, datetime, timedelta, timezone

# 이 서비스의 사용자는 한국에 있다. 기관 업무 시간도 창구 위치도 전부 한국이라
# 시간대를 설정으로 두지 않고 상수로 박는다 — 고를 일이 없는 것을 고르게 하면
# 어딘가에서 다른 값이 들어온다.
#
# **ZoneInfo가 아니라 고정 오프셋을 쓴다.** 한국은 1988년 이후 서머타임이 없어
# UTC+9가 변하지 않고, ZoneInfo는 실행 환경에 tzdata가 있어야 한다 — Windows와
# slim 컨테이너에는 없어서 임포트 시점에 죽는다. 시간대 하나 때문에 의존성을
# 늘리는 것보다, 바뀌지 않는 값을 그대로 적는 편이 실패 반경이 좁다.
KST = timezone(timedelta(hours=9), "KST")


def utcnow() -> datetime:
    """지금. **저장과 비교에는 이것을 쓴다.**"""
    return datetime.now(UTC)


def today_kst() -> date:
    """한국의 오늘. **사람이 '오늘'이라고 부르는 날짜다.**"""
    return datetime.now(KST).date()


def to_kst_date(moment: datetime) -> date:
    """어떤 순간이 한국에서 무슨 날이었는가.

    naive가 들어오면 UTC로 본다 — 옛 데이터에 시간대 없는 값이 남아 있고,
    그것들은 서버가 UTC일 때 쓰인 것이라 UTC로 읽는 것이 맞다.
    """
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(KST).date()
