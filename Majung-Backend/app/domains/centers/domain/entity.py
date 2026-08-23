"""지원기관·주민센터 Entity — 순수 Python (Domain)."""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Center:
    id: str
    category: str  # 법무보호공단 | 주민센터 | 고용센터
    name: str
    address: str
    phone: str
    hours: str
    lat: float
    lng: float
    tags: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class DistrictOffice:
    """읍면동 주민센터(행정복지센터·사무소 포함).

    Center와 달리 좌표와 전화번호가 없다. 원본(행정안전부 현황)에 없기 때문이고,
    창구 안내가 "가서 무슨 말을 하면 되는지" 형태라 주소만으로 충분하다.
    전화가 필요하면 정부민원안내콜센터 110으로 넘긴다.

    쓰임: 위치 기반 안내가 시군구까지만 알기 때문에 동 단위를 자동으로 특정할 수 없다.
    시군구로 걸러 사용자가 자기 동네를 고르게 한다. 전입신고(R11)는 새 주소지 관할이라
    이 목록이 필요하고, 신분증 재발급(R9)은 관할이 없어 필요하지 않다.
    """

    sido: str
    sigungu: str
    dong: str
    kind: str  # 행정복지센터 | 주민센터 | 사무소 | 출장소
    name: str
    zipcode: str
    address: str
