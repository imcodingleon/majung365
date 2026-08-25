"""GET /api/centers · /api/district-offices · /api/institutions — 기관 목록 조회.

Router는 조회·DTO 변환만. 비즈니스 로직 없음.
사용자의 지역은 준식별정보다 — 조회 조건을 로그에 남기지 않는다.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.domains.centers.domain.entity import Center, DistrictOffice, SupportInstitution
from app.domains.centers.infrastructure.district_office_repository import (
    JsonDistrictOfficeRepository,
)
from app.domains.centers.infrastructure.json_repository import JsonCenterRepository
from app.domains.centers.infrastructure.map_repository import JsonMapCenterRepository
from app.domains.centers.infrastructure.support_institution_repository import (
    JsonSupportInstitutionRepository,
)
from app.domains.shared.routes import RouteId, institution_kinds_for

router = APIRouter(prefix="/api", tags=["centers"])
_repo = JsonCenterRepository()
_district_repo = JsonDistrictOfficeRepository()
# 지도용 합본. 좌표가 있는 것만 담기며, 없으면 그 항목이 빠질 뿐 부팅은 막지 않는다.
_map_repo = JsonMapCenterRepository()


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
    sido: str | None = Query(default=None, max_length=20, description="예: 서울특별시"),
    district: str | None = Query(default=None, max_length=40, description="예: 송파구"),
) -> list[CenterOut]:
    """지도에 찍을 기관.

    **지역을 주면 주민센터와 정신건강복지센터까지 함께 나간다.** 주지 않으면 예전처럼
    `centers.json`만 나간다 — 전국 주민센터 3,555건을 통째로 보낼 수는 없다.

    사용자의 지역은 준식별정보다. 조회 조건을 로그에 남기지 않는다.
    """
    if sido and district:
        items = _map_repo.by_region(sido, district)
        if category:
            narrowed = [c for c in items if c.category == category]
            # 빈 갈래(오탈자 등)면 전체로 되돌린다. 화면이 비는 것보다 낫다.
            items = narrowed or items
        return [CenterOut.of(c) for c in items]

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


# ── GET /api/institutions — 지원 항목별로 갈 수 있는 기관 ──

_institution_repo = JsonSupportInstitutionRepository()
_MAX_INSTITUTIONS = 20


class SupportInstitutionOut(BaseModel):
    name: str
    kind: str
    sido: str
    district: str
    address: str
    phone: str

    @classmethod
    def of(cls, i: SupportInstitution) -> "SupportInstitutionOut":
        return cls(
            name=i.name,
            kind=i.kind,
            sido=i.sido,
            district=i.district,
            address=i.address,
            phone=i.phone,
        )


@router.get("/institutions", response_model=list[SupportInstitutionOut])
def list_support_institutions(
    route: str = Query(min_length=2, max_length=3, description="지원 항목 코드. 예: R8"),
    sido: str | None = Query(default=None, max_length=20, description="예: 서울"),
    district: str | None = Query(default=None, max_length=40, description="예: 강남구"),
) -> list[SupportInstitutionOut]:
    """그 지원 항목에서 갈 수 있는 기관을 사용자와 가까운 순으로 돌려준다.

    항목으로 조회하는 이유는 **항목마다 갈 기관의 종류가 다르기** 때문이다.
    R6은 교육원, R8은 허그센터와 정신건강복지센터이고, "가까운 공단"에 교육원이
    나오면 헛걸음이다.

    좌표는 받지 않는다(§9.5). 시군구까지만 알기 때문에 거리를 재지 못하고
    행정구역이 얼마나 겹치는지로 가까움을 가늠한다. 조회 조건은 로그에 남기지 않는다.
    """
    try:
        kinds = institution_kinds_for(RouteId(route))
    except ValueError:
        raise HTTPException(status_code=400, detail="지원 항목 코드가 올바르지 않아요.") from None
    if not kinds:
        # 공단 기관이 아니라 주민센터·은행으로 가는 항목이다. 빈 목록이 정상이다.
        return []
    found = _institution_repo.find(kinds, sido, district, limit=_MAX_INSTITUTIONS)
    return [SupportInstitutionOut.of(i) for i in found]
