"""GET /api/centers — 지원기관 목록 (지도 화면용).

Router는 조회·DTO 변환만. 비즈니스 로직 없음.
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.domains.centers.domain.entity import Center
from app.domains.centers.infrastructure.json_repository import JsonCenterRepository

router = APIRouter(prefix="/api", tags=["centers"])
_repo = JsonCenterRepository()


class CenterOut(BaseModel):
    id: str
    category: str
    name: str
    address: str
    phone: str
    hours: str
    lat: float
    lng: float
    tags: list[str]

    @classmethod
    def of(cls, c: Center) -> "CenterOut":
        return cls(
            id=c.id,
            category=c.category,
            name=c.name,
            address=c.address,
            phone=c.phone,
            hours=c.hours,
            lat=c.lat,
            lng=c.lng,
            tags=list(c.tags),
        )


@router.get("/centers", response_model=list[CenterOut])
def list_centers(
    category: str | None = Query(default=None, description="법무보호공단 | 주민센터 | 고용센터"),
) -> list[CenterOut]:
    items = _repo.by_category(category) if category else _repo.all()
    # 빈 카테고리(오탈자 등)면 전체로 폴백
    if category and not items:
        items = _repo.all()
    return [CenterOut.of(c) for c in items]
