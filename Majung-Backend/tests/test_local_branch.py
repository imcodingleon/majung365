"""공단 기관 안내 — 있는 데이터를 없다고 말하지 않는다.

**주민센터에서 고친 결함이 공단 지부에서 그대로 되풀이됐다.** "군포역 근처
법무보호복지공단 어디야?"에 이렇게 답이 나갔다.

> 정확한 지부 전화번호를 확인해보려 했는데, 지금은 검색이 잘 안 되네요.

그 순간 서버에는 경기지부 · 031-374-1423 · 경기도 군포시 산본로 822-38이 있었다.
"""

from app.domains.centers.domain.entity import SupportInstitution
from app.domains.chat.domain.local_branch import answer_for


def inst(
    name: str,
    address: str,
    phone: str = "031-000-0000",
    lat: float | None = None,
    lng: float | None = None,
) -> SupportInstitution:
    return SupportInstitution(
        name=name,
        kind="branch",
        sido="경기",
        district="",
        address=address,
        phone=phone,
        lat=lat,
        lng=lng,
    )


GUNPO = inst("경기지부", "경기도 군포시 산본로 822-38", "031-374-1423")
SUWON = inst("경기남부지부", "경기도 화성시 향남읍중앙로 154")


def test_nothing_found_stays_empty() -> None:
    """없으면 빈 결과다. 그때는 "가진 자료에 없다"고 답하는 것이 맞다."""
    assert answer_for("경기", "군포시", []).found is False


def test_branch_in_the_same_town_comes_with_its_number() -> None:
    """**주소와 번호를 그대로 낸다.** 이것이 이 기능의 전부다."""
    found = answer_for("경기", "군포시", [GUNPO, SUWON])
    assert found.found
    assert "031-374-1423" in found.injection
    assert "군포시 산본로 822-38" in found.injection


def test_only_the_matching_town_is_shown_when_one_matches() -> None:
    """군포 사람에게 화성 지부를 함께 내밀지 않는다."""
    found = answer_for("경기", "군포시", [GUNPO, SUWON])
    assert "경기남부지부" not in found.injection


def test_same_province_is_shown_when_no_town_matches() -> None:
    """**시군구가 안 맞아도 비우지 않는다.** 공단 기관은 전국에 서른여덟 곳뿐이라
    시군구로 거르면 대개 비고, 그때 "없다"고 답하면 처음 문제로 돌아간다."""
    found = answer_for("경기", "성남시", [GUNPO, SUWON])
    assert found.found
    assert "경기지부" in found.injection


def test_it_tells_the_model_not_to_defer_to_the_homepage() -> None:
    """모델이 홈페이지를 찾아보라고 미루던 것이 이 결함의 실제 모습이었다."""
    found = answer_for("경기", "군포시", [GUNPO])
    assert "미루지 않는다" in found.injection


def test_a_missing_phone_does_not_print_a_dangling_space() -> None:
    """번호가 없는 기관도 있다. 지어내지 않고 주소만 낸다."""
    found = answer_for("경기", "군포시", [inst("어딘가", "경기도 군포시 어딘가", phone="")])
    assert "  " not in found.injection


def test_it_does_not_flood_the_prompt() -> None:
    """한 지역에 여럿이면 몇 개까지만. 전부 늘어놓으면 고르기가 더 어렵다."""
    many = [inst(f"지부{i}", f"경기도 군포시 어딘가 {i}") for i in range(10)]
    found = answer_for("경기", "군포시", many)
    assert found.injection.count("- ") <= 4


# ── 가까운 순으로 낸다 ──

# 군포시청 언저리. 사용자가 말한 동네의 기준점이다.
GUNPO_ORIGIN = (37.3617, 126.9350)
# 수원 경기지부가 가장 가깝고, 화성·의정부 순으로 멀어진다.
SUWON = inst("경기지부", "경기도 수원시 장안구 천천로 126", lat=37.2967, lng=126.9770)
HWASEONG = inst("경기남부지부", "경기도 화성시 병점중앙로 154", lat=37.2076, lng=127.0356)
UIJEONGBU = inst("경기북부지부", "경기도 의정부시 입석로 45", lat=37.7386, lng=127.0339)


def test_the_nearest_one_comes_first() -> None:
    """**군포 사람에게 화성이 첫 줄이면 안 된다.** 이름순으로 두었을 때 실제로
    그랬다 — 경기남부(화성)가 경기지부(수원)보다 먼저 나왔다."""
    found = answer_for("경기", "군포시", [HWASEONG, UIJEONGBU, SUWON], origin=GUNPO_ORIGIN)
    lines = [x for x in found.injection.splitlines() if x.startswith("- ")]
    assert "경기지부" in lines[0]
    assert "경기북부지부" in lines[-1]


def test_distance_is_shown() -> None:
    """이름만으로는 어디가 가까운지 알 수 없다."""
    found = answer_for("경기", "군포시", [SUWON], origin=GUNPO_ORIGIN)
    assert "km)" in found.injection


def test_places_without_coordinates_go_last() -> None:
    """거리를 모르는 것을 가깝다고 할 수 없다."""
    unknown = inst("좌표없는지부", "경기도 어딘가")
    found = answer_for("경기", "군포시", [unknown, SUWON], origin=GUNPO_ORIGIN)
    lines = [x for x in found.injection.splitlines() if x.startswith("- ")]
    assert "경기지부" in lines[0]
    assert "좌표없는지부" in lines[-1]


def test_without_an_origin_it_falls_back_to_the_town_name() -> None:
    """기준점을 못 구했을 때도 답은 나가야 한다."""
    found = answer_for("경기", "수원시", [SUWON, HWASEONG])
    assert found.found
    assert "경기지부" in found.injection


def test_it_tells_the_model_the_order_matters() -> None:
    """줄 세워 놓고 모델이 다시 섞으면 소용이 없다."""
    found = answer_for("경기", "군포시", [SUWON], origin=GUNPO_ORIGIN)
    assert "맨 위가 가장 가깝다" in found.injection
