"""공단 기관 안내 — 있는 데이터를 없다고 말하지 않는다.

**주민센터에서 고친 결함이 공단 지부에서 그대로 되풀이됐다.** "군포역 근처
법무보호복지공단 어디야?"에 이렇게 답이 나갔다.

> 정확한 지부 전화번호를 확인해보려 했는데, 지금은 검색이 잘 안 되네요.

그 순간 서버에는 경기지부 · 031-374-1423 · 경기도 군포시 산본로 822-38이 있었다.
"""

from app.domains.centers.domain.entity import SupportInstitution
from app.domains.chat.domain.local_branch import answer_for


def inst(name: str, address: str, phone: str = "031-000-0000") -> SupportInstitution:
    return SupportInstitution(
        name=name,
        kind="branch",
        sido="경기",
        district="",
        address=address,
        phone=phone,
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
