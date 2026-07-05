"""지원기관 Entity — 순수 Python (Domain). 지도 화면(CAP-5)용."""

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
