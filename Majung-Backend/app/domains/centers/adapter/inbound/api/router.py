"""GET /api/centers · GET /api/district-offices — 기관 목록 조회.

Router는 조회·DTO 변환만. 비즈니스 로직 없음.
사용자의 지역은 준식별정보다 — 조회 조건을 로그에 남기지 않는다.
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.domains.centers.domain.entity import Center, DistrictOffice
from app.domains.centers.infrastructure.district_office_repository import (
    JsonDistrictOfficeRepository,
)
from app.domains.centers.infrastructure.json_repository import JsonCenterRepository

router = APIRouter(prefix="/api", tags=["centers"])
_repo = JsonCenterRepository()
_district_repo = JsonDistrictOfficeRepository()


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


class DistrictOfficeOut(BaseModel):
    sido: str
    sigungu: str
    dong: str
    kind: str
    name: str
    zipcode: str
    address: str

    @classmethod
    def of(cls, o: DistrictOffice) -> "DistrictOfficeOut":
        return cls(
            sido=o.sido,
            sigungu=o.sigungu,
            dong=o.dong,
            kind=o.kind,
            name=o.name,
            zipcode=o.zipcode,
            address=o.address,
        )


@router.get("/district-offices", response_model=list[DistrictOfficeOut])
def list_district_offices(
    sigungu: str = Query(min_length=1, max_length=40, description="예: 송파구"),
    sido: str | None = Query(
        default=None, max_length=20, description="예: 서울. 시군구 이름이 겹칠 때 좁힌다"
    ),
) -> list[DistrictOfficeOut]:
    """시군구의 읍면동 주민센터 목록. 전국 3,555건이라 시군구를 반드시 받는다.

    전입신고(R11)처럼 관할이 정해지는 안내에서 사용자가 자기 동네를 고르는 데 쓴다.
    신분증 재발급(R9)은 전국 어느 주민센터에서나 되므로 이 목록을 붙이지 않는다 —
    붙이면 정해진 곳에 가야 한다는 잘못된 인상을 준다.
    """
    return [DistrictOfficeOut.of(o) for o in _district_repo.by_sigungu(sigungu.strip(), sido)]
