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

from app.domains.shared.crime import CRIME_CATEGORIES

__all__ = ["CRIME_CATEGORIES"]  # 재수출임을 밝힌다 — ruff가 미사용으로 지우지 않게


@dataclass(frozen=True)
class Place:
    """마지막으로 알아낸 자리 (2026-08-26 결정 F-1).

    **예선부터 이어온 "좌표를 우리 서버로 보내지 않는다"를 뒤집은 것이다.** 시군구까지만
    아는 서버는 그 동네 기관들의 한가운데로 거리를 쟀는데, 시군구 안에서 그 한가운데가
    엉뚱한 곳을 가리켰다 — 군포역에 사는 사람에게 산본 주민센터가 먼저 나왔다.

    지역을 직접 고른 경우에는 좌표가 없다. 그때는 예전처럼 동네 한가운데로 가늠한다.
    """

    sido: str
    district: str
    dong: str = ""
    lat: float | None = None
    lng: float | None = None

    def origin(self) -> tuple[float, float] | None:
        """거리를 잴 기준점. **좌표는 짝으로만 쓴다** — 하나만 있으면 없는 것이다."""
        if self.lat is None or self.lng is None:
            return None
        return (self.lat, self.lng)


@dataclass(frozen=True)
class Account:
    """사용자 한 명. **죄목은 여기 없다.**"""

    id: UUID
    name: str
    birth_date: date
    release_date: date
    created_at: datetime
    last_seen_on: date
    # 마지막으로 알아낸 자리. 아직 위치를 알린 적이 없으면 None이다.
    place: Place | None = None
    place_at: datetime | None = None

    def days_since_release(self, today: date) -> int:
        """출소 후 경과 일수. 기한이 있는 제도(긴급복지 등)의 판정 입력이다.

        외부 API로 나가는 것은 이 값이지 출소날짜가 아니다(§9.3).
        """
        return (today - self.release_date).days


# 동의 종류. 화면이 쓰는 값이 정본이고 서버는 그것을 받는다.
#
# **어긋나도 200이 오는 것이 가장 나쁘다.** 검증이 없으면 프론트가 다른 값을
# 보내도 저장은 되고, 아무도 모르는 채로 기록만 어긋난다.
# 죄목을 저장해도 되는지 가르는 동의. **이름을 여기 한 번만 적는다.**
#
# 검증 목록과 판정 함수가 서로 다른 값을 보고 있던 적이 있다. 검증은 "crime"을
# 받아 통과시키는데 판정은 "crime_category"를 찾아서, 동의하고 보낸 죄목이
# 조용히 버려졌다. 오류도 안 나고 저장만 안 된다.
CRIME_CONSENT_KIND = "crime"

# **없으면 가입 자체가 성립하지 않는 동의다.** 같은 이유로 이름을 여기 한 번만 적는다.
#
# 이것을 확인하는 코드가 없어서, 동의를 하나도 보내지 않아도 이름·생일·출소날짜가
# 그대로 암호화 저장되고 200이 나갔다. 죄목 쪽은 동의를 확인하는데 정작 **필수
# 동의를 아무도 보지 않았다** — 없는 검사는 실패하지도 않아 눈에 띄지 않는다.
PRIVACY_CONSENT_KIND = "privacy"

CONSENT_KINDS = frozenset({
    PRIVACY_CONSENT_KIND,  # 개인정보 수집·이용 (필수)
    CRIME_CONSENT_KIND,    # 민감정보 수집·이용 (죄목을 밝힌 경우에만 화면에 나온다)
    "share",               # 제3자 제공 (선택)
})

# 값 목록은 `shared/crime.py`가 정본이다 — `knowledge`가 안내를 고르는 데 같은
# 값을 보는데, 여기 두면 그 도메인이 account를 import하게 된다.
# 이 이름으로 import하던 곳(router·테스트)이 그대로 돌게 다시 내보낸다.


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
