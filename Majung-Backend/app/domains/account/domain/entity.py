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

    kind: str  # privacy | crime_category | ...
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
