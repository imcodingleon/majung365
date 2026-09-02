"""사용자 신원 정보와 그 마스킹된 형태 — 순수 Python (Domain).

기획서 §9.4가 정한 전송 정책이 여기 타입으로 박혀 있다.

| 항목 | 외부 API로 | 이유 |
|---|---|---|
| 이름 | **보내지 않는다** | 어떤 경우에도. 화면의 인사말은 클라이언트가 붙인다 |
| 생일 | 연령대로 바꿔 보낸다 | "50대"면 제도 판정에 충분하다 |
| 출소날짜 | 경과 일수로 바꿔 보낸다 | 기한 판정에 필요한 것은 날짜가 아니라 며칠이 지났는가다 |
| 수용 사유 대분류 | **그대로 보낸다** | 개인화의 핵심 입력이다. 아래 참고 |

**수용 사유를 보내는 것이 안전한 근거는 식별 불가능성이다.** 대분류만으로는
특정 개인을 가리키지 못한다. 이름과 생년월일과 날짜를 지우고 나면 모델이 받는
것은 "재산·경제범죄 이력이 있고 출소한 지 20일 지난 50대 어떤 사람"이며, 이것은
누구인지 알 수 없다. 위험한 것은 수용 사유 자체가 아니라 **수용 사유와 신원의
결합**이고, 결합을 끊는 것이 마스킹의 목적이다.

**따라서 조건이 붙는다.** 수용 사유를 보내는 것은 식별정보 마스킹이 확실하게
동작할 때에만 정당하다. 마스킹이 새면 이 결정의 전제가 무너진다.

`masking.py`가 아니라 여기 있는 이유는 의존 방향이다. Domain(knowledge·chat)이
이 타입을 쓰는데 Infrastructure에 두면 안쪽이 바깥쪽을 import하게 된다.
`masking.py`는 이 이름들을 다시 내보내므로 기존 호출부는 그대로 돈다.
"""

from dataclasses import dataclass
from datetime import date

from app.domains.shared.crime import crime_label


@dataclass(frozen=True)
class Profile:
    """사용자 신원 정보. **이 객체는 외부 API로 나가지 않는다.**

    외부 호출에 넘길 때는 반드시 mask_profile()로 MaskedProfile을 만든다.
    """

    name: str | None = None
    birth_date: date | None = None
    release_date: date | None = None
    # 수용 사유 대분류. 개인화의 핵심 입력이라 그대로 보낸다 — 다만 위 셋이 지워진다는 전제에서만.
    crime_category: str | None = None


@dataclass(frozen=True)
class MaskedProfile:
    """외부 API로 나가도 되는 형태. 원본 날짜와 이름은 들어 있지 않다."""

    age_band: str | None = None  # "50대"
    days_since_release: int | None = None
    crime_category: str | None = None


def age_band(birth: date, today: date) -> str:
    """생일을 연령대로. 제도 판정에는 "50대"면 충분하고 생년월일은 식별정보다."""
    years = today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))
    if years < 20:
        return "10대 이하"
    if years >= 70:
        return "70대 이상"
    return f"{years // 10 * 10}대"


def mask_profile(profile: Profile, today: date) -> MaskedProfile:
    """신원 정보를 외부로 보낼 수 있는 형태로 바꾼다.

    이름은 어떤 형태로도 담지 않는다 — 이니셜이나 성만 남겨도 다른 단서와 합치면
    사람이 좁혀진다. 화면의 인사말은 클라이언트가 붙인다.
    """
    return MaskedProfile(
        age_band=age_band(profile.birth_date, today) if profile.birth_date else None,
        days_since_release=(
            (today - profile.release_date).days if profile.release_date else None
        ),
        crime_category=profile.crime_category,
    )


def profile_line(profile: MaskedProfile | None) -> str:
    """모델에게 보낼 한 줄. **아는 것만 적고 모르는 자리는 비운다.**

    "· 수용 사유: 밝히지 않음"처럼 없다는 사실을 적지 않는다. 그렇게 적으면
    모델이 그 자체를 하나의 정보로 다뤄 "말씀하기 어려우시면"처럼 캐묻는 말이
    나온다 — 밝히지 않은 것은 정당한 선택이고 되물을 일이 아니다(§3.3-⑥).

    코드값이 아니라 사람이 읽는 이름을 쓴다. "property"를 보내면 모델이 재산으로
    읽을지 부동산으로 읽을지 모른다.
    """
    if profile is None:
        return ""
    parts: list[str] = []
    if profile.age_band:
        parts.append(profile.age_band)
    if profile.days_since_release is not None:
        parts.append(f"출소 후 {profile.days_since_release}일")
    if profile.crime_category:
        label = crime_label(profile.crime_category)
        if label:
            parts.append(f"수용 사유 대분류: {label}")
    return " · ".join(parts)
