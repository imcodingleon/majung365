"""가입 정보 Entity — 순수 Python (Domain).

기획서 §3.1·§9.1. **이 계층은 평문을 다룬다.** 암호화는 저장 직전(infrastructure)에,
마스킹은 외부 전송 직전(adapter)에 걸린다. 도메인이 암호문을 들고 있으면 판정 로직이
복호화 여부를 신경 써야 하고, 그러다 한 곳에서 빠뜨린다.

**죄목을 다른 타입으로 분리했다.** 같은 객체에 담아 두면 "죄목을 빼고 넘긴다"가
호출부의 주의력에 달리는데, 담당자 화면(§7.4)과 대부분의 조회 경로에서 죄목은 가면
안 된다. 타입이 다르면 잊을 수가 없다.
"""

from dataclasses import dataclass
from datetime import date, datetime
from uuid import UUID


@dataclass(frozen=True)
class Account:
    """사용자 한 명. **죄목은 여기 없다.**"""

    id: UUID
    name: str
    birth_date: date
    release_date: date
    created_at: datetime
    last_seen_on: date

    def days_since_release(self, today: date) -> int:
        """출소 후 경과 일수. 기한이 있는 제도(긴급복지 등)의 판정 입력이다.

        외부 API로 나가는 것은 이 값이지 출소날짜가 아니다(§9.3).
        """
        return (today - self.release_date).days


# 동의 종류. 화면이 쓰는 값이 정본이고 서버는 그것을 받는다.
#
# **어긋나도 200이 오는 것이 가장 나쁘다.** 검증이 없으면 프론트가 다른 값을
# 보내도 저장은 되고, 아무도 모르는 채로 기록만 어긋난다.
CONSENT_KINDS = frozenset({
    "privacy",  # 개인정보 수집·이용 (필수)
    "crime",    # 민감정보 수집·이용 (필수이나 죄목을 밝힌 경우에만 화면에 나온다)
    "share",    # 제3자 제공 (선택)
})

# 죄목 대분류. **"말하고 싶지 않아요"(undisclosed)는 여기 없다.**
# 말하지 않겠다고 한 것을 "말하지 않음"이라는 값으로 저장하면 그것도 하나의
# 기록이 된다(§9.1 데이터 최소화). 프론트는 그 경우 필드 자체를 빼고 보낸다.
CRIME_CATEGORIES = frozenset({
    "violent",   # 폭력·강력범죄
    "sexual",    # 성범죄
    "property",  # 재산·경제범죄
    "drug",      # 마약·중독범죄
    "other",     # 기타범죄
})


@dataclass(frozen=True)
class CrimeCategory:
    """죄목 대분류. 별도 타입이자 별도 테이블이다(§9.1).

    동의를 철회하면 이것만 지운다. 계정은 남는다.
    """

    user_id: UUID
    category: str
    consented_at: datetime


@dataclass(frozen=True)
class Consent:
    """동의 이력. 평문으로 저장한다 — 식별정보가 아니고, 분쟁이 생겼을 때
    그대로 읽혀야 하는 기록이다."""

    kind: str  # CONSENT_KINDS 중 하나
    agreed: bool
    at: datetime


@dataclass(frozen=True)
class Session:
    """기기 세션(§2.4). 가입을 마치면 발급되고 앱이 보관한다.

    **토큰 원문은 서버에 저장하지 않는다.** 해시만 두어 DB가 유출돼도 세션을
    탈취당하지 않게 한다 — 비밀번호를 평문으로 두지 않는 것과 같은 이유다.
    """

    user_id: UUID
    expires_at: datetime

    def is_valid(self, now: datetime) -> bool:
        return now < self.expires_at
