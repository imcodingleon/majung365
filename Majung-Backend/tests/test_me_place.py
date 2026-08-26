"""마지막 위치를 남기고 돌려주는 길 (2026-08-26 결정 F-1).

**예선부터 이어온 "좌표를 우리 서버로 보내지 않는다"를 뒤집은 결정이다.** 시군구까지만
아는 서버는 그 동네 기관들의 한가운데로 거리를 쟀는데, 군포시는 기관이 산본신도시에
몰려 있어 군포역에 사는 사람에게 산본 주민센터가 먼저 나왔다.

여기서 지키려는 것 둘이다. **좌표가 짝으로만 쓰이는가**, 그리고 **한 자리만 남는가**.
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from app.domains.account.adapter.inbound.api.router import MeUpdateIn, PlaceIn, update_me
from app.domains.account.domain.entity import Account, CrimeCategory, Place
from app.domains.account.domain.tokens import utcnow

GUNPO_STATION = (37.35617, 126.94834)


@dataclass
class FakeCrimes:
    stored: dict[UUID, str] = field(default_factory=dict)

    def by_user(self, user_id: UUID) -> CrimeCategory | None:
        found = self.stored.get(user_id)
        if found is None:
            return None
        return CrimeCategory(user_id=user_id, category=found, consented_at=utcnow())

    def revoke(self, user_id: UUID) -> None:
        self.stored.pop(user_id, None)


@dataclass
class FakeAccounts:
    """저장된 자리를 **덮어쓴다.** 쌓지 않는 것이 이 설계의 요점이다."""

    saved: list[tuple[Place, datetime]] = field(default_factory=list)

    def save_place(self, user_id: UUID, place: Place, now: datetime) -> None:
        self.saved.append((place, now))


def _account(place: Place | None = None) -> Account:
    return Account(
        id=uuid4(),
        name="김판수",
        birth_date=date(1975, 3, 2),
        release_date=date(2026, 8, 3),
        created_at=utcnow(),
        last_seen_on=date(2026, 8, 26),
        place=place,
    )


def _request(crimes: FakeCrimes, accounts: FakeAccounts) -> SimpleNamespace:
    return SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(crime_repo=crimes, account_repo=accounts))
    )


def test_place_is_saved() -> None:
    accounts = FakeAccounts()
    body = MeUpdateIn(
        place=PlaceIn(sido="경기도", district="군포시", dong="당동", lat=37.35617, lng=126.94834)
    )

    update_me(body, _request(FakeCrimes(), accounts), _account())  # type: ignore[arg-type]

    assert len(accounts.saved) == 1
    saved, _ = accounts.saved[0]
    assert (saved.sido, saved.district, saved.dong) == ("경기도", "군포시", "당동")
    assert saved.origin() == pytest.approx(GUNPO_STATION)


def test_region_without_coordinates_is_saved_too() -> None:
    """**지역을 직접 고른 사람도 남는다** (§5.4). 그때는 좌표가 없을 뿐이다."""
    accounts = FakeAccounts()
    body = MeUpdateIn(place=PlaceIn(sido="경기도", district="군포시"))

    update_me(body, _request(FakeCrimes(), accounts), _account())  # type: ignore[arg-type]

    saved, _ = accounts.saved[0]
    assert saved.origin() is None


def test_half_a_coordinate_is_no_coordinate() -> None:
    """하나만 오면 없는 것으로 친다. 반쪽 좌표로 거리를 재면 엉뚱한 곳이 나온다."""
    accounts = FakeAccounts()
    body = MeUpdateIn(place=PlaceIn(sido="경기도", district="군포시", lat=37.35617))

    update_me(body, _request(FakeCrimes(), accounts), _account())  # type: ignore[arg-type]

    saved, _ = accounts.saved[0]
    assert saved.origin() is None


def test_coordinates_outside_korea_are_refused() -> None:
    """범위 밖 값은 오작동이거나 장난이다. 그대로 재면 가장 먼 곳이 "가까운 곳"이 된다."""
    with pytest.raises(ValidationError):
        PlaceIn(sido="경기도", district="군포시", lat=0.0, lng=0.0)


def test_place_and_crime_do_not_block_each_other() -> None:
    """한 요청에 함께 와도 서로를 막지 않는다."""
    crimes, accounts = FakeCrimes(), FakeAccounts()
    crimes.stored[(acc := _account()).id] = "property"

    out = update_me(
        MeUpdateIn(
            crime_category_revoked=True,
            place=PlaceIn(sido="경기도", district="군포시", lat=37.35617, lng=126.94834),
        ),
        _request(crimes, accounts),  # type: ignore[arg-type]
        acc,
    )

    assert accounts.saved, "위치가 안 남았다"
    assert crimes.stored == {}
    assert out.has_crime_category is False


def test_saved_place_comes_back() -> None:
    """**이것이 없으면 다시 들어왔을 때 지도가 동네 한가운데로 돌아간다.**"""
    here = Place(sido="경기도", district="군포시", dong="당동", lat=37.35617, lng=126.94834)

    out = update_me(
        MeUpdateIn(),
        _request(FakeCrimes(), FakeAccounts()),  # type: ignore[arg-type]
        _account(here),
    )

    assert out.place is not None
    assert (out.place.lat, out.place.lng) == pytest.approx(GUNPO_STATION)


def test_no_place_is_not_an_error() -> None:
    """아직 위치를 알린 적이 없는 사람이다. 그 자리를 무엇으로도 채우지 않는다."""
    out = update_me(
        MeUpdateIn(),
        _request(FakeCrimes(), FakeAccounts()),  # type: ignore[arg-type]
        _account(),
    )
    assert out.place is None
