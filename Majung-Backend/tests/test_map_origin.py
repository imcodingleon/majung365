"""지도 기관을 무엇을 기준으로 줄 세우는가 (2026-08-26 결정 F-1).

**군포에서 실제로 어긋났다.** 시군구까지만 받던 때는 그 동네 기관들의 한가운데를
기준으로 삼았는데, 군포시는 기관이 산본신도시에 몰려 있어 한가운데가 산본으로
끌려갔다. 군포역에 사는 사람에게 산본 주민센터가 먼저 나왔다.
"""

from app.domains.centers.domain.entity import Center
from app.domains.centers.infrastructure.map_repository import JsonMapCenterRepository

# 실제 좌표다. 두 역은 3km 남짓 떨어져 있다.
GUNPO_STATION = (37.35617, 126.94834)
SANBON_STATION = (37.35843, 126.93290)


def _repo() -> JsonMapCenterRepository:
    return JsonMapCenterRepository()


def _names(items: list[Center]) -> list[str]:
    return [c.name for c in items]


def test_origin_changes_which_offices_come_first() -> None:
    """**같은 시군구인데 어디에 서 있느냐로 답이 갈린다.**

    이 차이가 곧 좌표를 받기로 한 이유다. 갈리지 않는다면 받을 이유가 없다.
    """
    near_gunpo = _names(_repo().by_region("경기도", "군포시", GUNPO_STATION))
    near_sanbon = _names(_repo().by_region("경기도", "군포시", SANBON_STATION))
    assert near_gunpo != near_sanbon


def test_nearest_office_is_actually_nearest() -> None:
    """맨 앞에 오는 주민센터가 정말로 그 자리에서 가장 가까운가."""
    from app.domains.centers.domain.distance import distance_km

    shown = _repo().by_region("경기도", "군포시", GUNPO_STATION)
    offices = [c for c in shown if c.category == "주민센터"]
    assert offices, "주민센터가 하나도 안 나왔다"

    measured = [distance_km(GUNPO_STATION, c.lat, c.lng) for c in offices]
    # 서버가 이미 줄을 세워 보낸다. 화면이 다시 세우지 않는다.
    assert measured == sorted(measured)


def test_without_origin_it_still_answers() -> None:
    """**좌표를 안 줘도 화면이 비면 안 된다.** 위치를 거부하고 지역을 직접 고른
    사용자가 이 길로 온다 (§5.4). 그때는 동네 한가운데를 기준으로 삼는다."""
    shown = _repo().by_region("경기도", "군포시")
    assert shown, "좌표 없이 불렀더니 아무것도 안 나왔다"


def test_each_category_is_capped() -> None:
    """갈래마다 셋씩. 지도에 아홉 개 안팎이 찍혀야 눈으로 읽힌다."""
    shown = _repo().by_region("경기도", "군포시", GUNPO_STATION)
    for category in {c.category for c in shown}:
        assert len([c for c in shown if c.category == category]) <= 3
