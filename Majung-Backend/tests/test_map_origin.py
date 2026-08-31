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


# ── 시군구 없이 시도만 골랐을 때 (2026-08-31) ──
#
# 지역 선택 화면이 시도만 고르고 넘어가는 길을 열어 두었다. 그 길로 온 요청을
# 서버가 받지 않으면 조회가 `centers.json`(수도권 다섯 곳)으로 빠져,
# **부산 사용자에게 서울 지부가 나간다.** 출소 직후의 헛걸음이 이 서비스가
# 가장 피하려는 결과다.


def test_sido_only_stays_in_that_sido() -> None:
    """시도만 골라도 그 시도의 기관이 나온다."""
    shown = _repo().by_region("부산광역시")
    assert shown, "시도만 줬더니 아무것도 안 나왔다"

    offices = [c for c in shown if c.category == "주민센터"]
    assert offices, "그 시도의 주민센터가 하나도 안 나왔다"
    assert all("부산" in c.address for c in offices)


def test_sido_only_does_not_leak_other_sido_offices() -> None:
    """다른 시도의 주민센터가 섞이지 않는다.

    공단과 정신건강복지센터는 시군구당 하나꼴이라 지역이 안 맞아도 남기지만,
    주민센터는 전국 3,555건이라 지역 밖의 것이 나오면 그대로 헛걸음이다.
    """
    for sido in ("부산광역시", "전라남도", "제주특별자치도"):
        offices = [c for c in _repo().by_region(sido) if c.category == "주민센터"]
        assert offices, f"{sido}에서 주민센터가 안 나왔다"
        head = sido[:2]
        assert all(head in c.address for c in offices), f"{sido} 밖의 주민센터가 섞였다"


def test_sido_only_is_still_capped() -> None:
    """시군구가 없어도 갈래마다 셋에서 자른다. 주민센터가 시도 하나에 수백 건이다."""
    shown = _repo().by_region("서울특별시")
    for category in {c.category for c in shown}:
        assert len([c for c in shown if c.category == category]) <= 3


# ── 고른 동의 주민센터 (2026-08-31) ──
#
# **안양 호계3동에서 실제로 빠졌다.** 사용자가 호계3동을 골랐는데 호계3동
# 행정복지센터가 목록에 없고 호계2동이 가장 가까운 곳으로 나왔다.
#
# 원인은 좌표다. `district_offices.json`의 호계3동 좌표가 호계1동과 똑같은 값이라
# (주소는 경수대로 504와 538로 다른데 지오코딩이 같은 점을 줬다), 자기 동 경계
# 중심에서 1.22km로 4위가 되어 갈래마다 셋에서 잘렸다.
#
# **좌표를 고쳐서 끝낼 문제가 아니다.** 전수 검사에서 3,348곳 중 93곳이 자기 동
# 경계 밖에 찍혀 있었고, 그중에는 임시청사(칠곡군 왜관읍)나 민통선 밖 청사(파주시
# 장단면)처럼 **정당하게 밖에 있는 것**이 섞여 있어 자동으로 가릴 수 없다. 게다가
# 경계 데이터가 2021년이라 그 뒤 분동된 207곳은 판정조차 못 한다.
#
# 반면 **이름으로 짚으면 3,495개 중 3,356개(96.0%)가 맞는다.** 못 맞추는 4%는
# 부천시 행정동 개편처럼 두 자료의 시점이 다른 경우이고, 그때는 예전처럼 거리로
# 물러서면 되므로 퇴행이 없다.

# 호계3동 경계 한가운데. 화면이 동을 고르면 이 좌표를 보낸다.
HOGYE3_CENTER = (37.36745, 126.95825)


def test_picked_dong_office_is_included() -> None:
    """**고른 동의 주민센터는 거리와 무관하게 들어간다.**

    관할이 아닌 곳을 찾아가면 헛걸음이다. 좌표가 어디에 찍혀 있든 사용자가 고른
    동의 이름을 가진 주민센터가 있으면 그것을 보여줘야 한다.
    """
    shown = _repo().by_region("경기도", "안양시", HOGYE3_CENTER, dong="호계3동")
    offices = [c for c in shown if c.category == "주민센터"]
    assert any("호계3동" in c.name for c in offices), _names(shown)


def test_picked_dong_office_comes_first() -> None:
    """관할 주민센터가 주민센터 갈래의 맨 앞에 온다."""
    shown = _repo().by_region("경기도", "안양시", HOGYE3_CENTER, dong="호계3동")
    offices = [c for c in shown if c.category == "주민센터"]
    assert offices, "주민센터가 하나도 안 나왔다"
    assert "호계3동" in offices[0].name, _names(offices)


def test_unknown_dong_falls_back_to_distance() -> None:
    """**이름이 안 맞으면 예전처럼 거리로만 세운다.**

    두 자료의 시점이 달라 4%가 이 길로 온다. 그때 화면이 비거나 순서가 흐트러지면
    고치기 전보다 나빠진다.
    """
    from app.domains.centers.domain.distance import distance_km

    shown = _repo().by_region("경기도", "안양시", HOGYE3_CENTER, dong="없는동")
    offices = [c for c in shown if c.category == "주민센터"]
    assert offices, "이름이 안 맞았다고 주민센터가 통째로 사라졌다"

    measured = [distance_km(HOGYE3_CENTER, c.lat, c.lng) for c in offices]
    assert measured == sorted(measured)


def test_dong_does_not_break_the_cap() -> None:
    """동을 짚어 넣어도 갈래마다 셋을 넘지 않는다."""
    shown = _repo().by_region("경기도", "안양시", HOGYE3_CENTER, dong="호계3동")
    for category in {c.category for c in shown}:
        assert len([c for c in shown if c.category == category]) <= 3


def test_dong_does_not_pull_in_other_districts() -> None:
    """**같은 이름의 동이 전국에 여럿이다.** 다른 시군구의 같은 이름을 끌어오면 안 된다.

    "중앙동"은 전국 서른두 곳이다.
    """
    shown = _repo().by_region("경기도", "군포시", None, dong="중앙동")
    offices = [c for c in shown if c.category == "주민센터"]
    assert all("군포" in c.address for c in offices), _names(offices)
