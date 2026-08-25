"""지도에 찍을 기관 — 세 자료를 한 모양으로 합친다 (Infrastructure).

**좌표가 있는 것만 낸다.** 지도는 점을 찍는 화면이라 위도·경도가 없는 항목은 실을
자리가 없다. `tools/fill_coordinates.py`가 채우지 못한 항목은 여기서 조용히 빠지고,
그 사실은 그 스크립트가 목록으로 보고한다.

**시군구를 반드시 받는다.** 주민센터만 3,555건이라 전부 보내면 화면이 받아 들 수도,
사용자가 훑어볼 수도 없다.
"""

import json
from pathlib import Path

from app.domains.centers.domain.distance import Point, distance_km
from app.domains.centers.domain.entity import Center
from app.domains.centers.domain.region import normalize_district, normalize_sido

# 기준점을 못 구했을 때 쓰는 값. 정렬만 하고 순서는 바꾸지 않도록 모두 같은 값을 준다.
_UNKNOWN = float("inf")

# 갈래마다 몇 곳까지 낼지. **거리가 아니라 개수로 자른다** — 울릉군에서 가장 가까운
# 공단이 176km이고, 반경으로 자르면 그런 곳이 빈 화면을 본다.
_PER_CATEGORY = 3


def _take_by_category(ordered: list[Center]) -> list[Center]:
    """이미 가까운 순으로 놓인 목록에서 갈래마다 앞 세 곳씩.

    **전체 순서를 그대로 지킨다.** 갈래별로 담았다가 이어 붙이면 갈래 안에서는
    가깝지만 화면에 나가는 순서가 뒤섞인다 — 완도에서 광주남부(89km)보다
    제주지부(98km)가 먼저 나왔던 것이 그 때문이다.
    """
    seen: dict[str, int] = {}
    taken: list[Center] = []
    for c in ordered:
        count = seen.get(c.category, 0)
        if count < _PER_CATEGORY:
            seen[c.category] = count + 1
            taken.append(c)
    return taken


def _center_of(items: list[Center]) -> Point | None:
    """그 동네 기관들의 한가운데. 하나도 없으면 `None`."""
    if not items:
        return None
    return (
        sum(c.lat for c in items) / len(items),
        sum(c.lng for c in items) / len(items),
    )


def _distance_km(origin: Point, c: Center) -> float:
    """정렬용 거리. 좌표가 없으면 맨 뒤로 보낸다."""
    found = distance_km(origin, c.lat, c.lng)
    return _UNKNOWN if found is None else found

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# 화면의 갈래 칩과 맞춘 이름. 여기가 곧 사용자가 보는 말이다.
KOREHA = "법무보호공단"
DISTRICT = "주민센터"
MENTAL = "정신건강복지센터"


def _has_point(row: dict[str, object]) -> bool:
    return isinstance(row.get("lat"), (int, float)) and isinstance(row.get("lng"), (int, float))


def _sido_in(address: str) -> str:
    """주소 첫 어절의 시도를 **조회와 같은 형태로**.

    주소는 정식 명칭("전라남도")인데 화면은 축약형("전남")으로도 보낸다. 양쪽을 같은
    자로 재야 맞는다 — 문자열을 그대로 견주면 완도군이 통째로 사라진다.
    """
    head = address.strip().split(" ", 1)[0] if address else ""
    return normalize_sido(head)


def _load(filename: str, list_key: str) -> list[dict[str, object]]:
    raw = json.loads((_DATA_DIR / filename).read_text(encoding="utf-8"))
    return [row for row in raw[list_key] if _has_point(row)]


class JsonMapCenterRepository:
    """지도용 합본. 부팅 때 한 번 읽고 메모리에 둔다."""

    def __init__(self) -> None:
        self._items: list[Center] = []
        self._items += self._koreha()
        self._items += self._district_offices()
        self._items += self._mental_health()
        # 주소에서 뽑은 시도를 미리 계산해 둔다. 3,839건을 조회마다 다시 자르면
        # 화면을 열 때마다 그만큼 문자열을 쪼개게 된다.
        self._sido = {c.id: _sido_in(c.address) for c in self._items}

    # ── 자료별 변환 ──

    def _koreha(self) -> list[Center]:
        rows = _load("koreha_branches.json", "items")
        return [
            Center(
                id=f"koreha:{i}",
                category=KOREHA,
                name=str(row["name"]),
                address=str(row["address"]),
                phone=str(row.get("phone", "")),
                # 원본에 운영시간이 없다. 공단 지부는 평일 근무가 기본이다.
                hours="평일 09:00 - 18:00",
                lat=float(row["lat"]),  # type: ignore[arg-type]
                lng=float(row["lng"]),  # type: ignore[arg-type]
                tags=(str(row.get("sido", "")),) if row.get("sido") else (),
            )
            for i, row in enumerate(rows)
        ]

    def _district_offices(self) -> list[Center]:
        rows = _load("district_offices.json", "offices")
        return [
            Center(
                id=f"office:{i}",
                category=DISTRICT,
                name=str(row["name"]),
                address=str(row["address"]),
                # **번호를 지어내지 않는다.** 원본에 전화번호가 없다. 필요하면 화면이
                # 정부민원안내콜센터 110으로 넘긴다.
                phone="",
                hours="평일 09:00 - 18:00",
                lat=float(row["lat"]),  # type: ignore[arg-type]
                lng=float(row["lng"]),  # type: ignore[arg-type]
                tags=(str(row.get("dong", "")),) if row.get("dong") else (),
            )
            for i, row in enumerate(rows)
        ]

    def _mental_health(self) -> list[Center]:
        rows = _load("mental_health_centers.json", "items")
        return [
            Center(
                id=f"mental:{i}",
                category=MENTAL,
                # 원본에 이름이 없는 항목이 있다. 그때는 지역으로 부른다.
                name=str(row.get("name") or f"{row.get('district', '')} 정신건강복지센터").strip(),
                address=str(row["address"]),
                phone=str(row.get("phone", "")),
                hours="평일 09:00 - 18:00",
                lat=float(row["lat"]),  # type: ignore[arg-type]
                lng=float(row["lng"]),  # type: ignore[arg-type]
                tags=(str(row.get("district", "")),) if row.get("district") else (),
            )
            for i, row in enumerate(rows)
        ]

    # ── 조회 ──

    def by_region(self, sido: str, district: str) -> list[Center]:
        """그 지역의 기관을 **갈래마다 가까운 순 세 곳씩**.

        **주소 문자열로 거른다.** 세 자료의 시도 표기가 서로 달라("서울" · "서울특별시")
        필드를 맞대면 한쪽이 통째로 빠진다. 주소에는 어느 쪽 표기든 들어 있다.

        **거리로 자르지 않고 개수로 자른다.** 시군구별로 가장 가까운 공단까지 거리를
        재 보니 중앙값 15km인데 울릉군은 176km였다. 어떤 반경을 잡아도 섬과 산간은
        잘리는데, **그런 곳에 사는 사람이야말로 어디로 가야 하는지가 절실하다.**
        176km라도 알려주는 편이 "근처에 없습니다"보다 낫다.

        갈래마다 셋이면 지도에 아홉 개 안팎이 찍혀 눈으로 읽힌다. 거리는 화면이 함께
        보여주므로 멀면 사용자가 전화로 먼저 물어볼 것이다.
        """
        # **화면이 무엇을 보내든 받는다** (§5.4 · `region.py`). "전라남도"로 와도
        # "전남"으로 와도 주소의 "전라남도"와 맞아야 한다. 앞 두 글자로 자르면
        # "전라남도"가 "전라"가 되어 어긋난다.
        head = normalize_sido(sido)
        town = normalize_district(district)

        # 그 동네에 있는 것과, 지역이 안 맞아도 남길 것을 가른다.
        # **공단과 정신건강복지센터는 지역이 안 맞아도 남긴다** — 전국에 서른여덟 곳,
        # 시군구당 하나꼴이라 지역으로 거르면 통째로 사라진다.
        in_town: list[Center] = []
        elsewhere: list[Center] = []
        for c in self._items:
            same_place = bool(head and town) and self._sido[c.id] == head and town in c.address
            if same_place:
                in_town.append(c)
            elif c.category != DISTRICT:
                elsewhere.append(c)

        # 기준점은 그 동네 기관들의 한가운데다. **사용자 좌표를 받지 않으므로**(§5.4)
        # 그 지역에 있는 것들의 평균으로 동네 위치를 가늠한다.
        origin = _center_of(in_town)
        if origin is None:
            # 그 동네에 아무것도 없으면 거리를 잴 기준이 없다. 갈래별로 앞에서 자른다.
            return _take_by_category(elsewhere)

        ordered = sorted([*in_town, *elsewhere], key=lambda c: _distance_km(origin, c))
        return _take_by_category(ordered)
