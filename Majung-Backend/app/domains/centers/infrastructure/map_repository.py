"""지도에 찍을 기관 — 세 자료를 한 모양으로 합친다 (Infrastructure).

**좌표가 있는 것만 낸다.** 지도는 점을 찍는 화면이라 위도·경도가 없는 항목은 실을
자리가 없다. `tools/fill_coordinates.py`가 채우지 못한 항목은 여기서 조용히 빠지고,
그 사실은 그 스크립트가 목록으로 보고한다.

**시군구를 반드시 받는다.** 주민센터만 3,555건이라 전부 보내면 화면이 받아 들 수도,
사용자가 훑어볼 수도 없다.
"""

import json
from pathlib import Path

from app.domains.centers.domain.entity import Center

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# 화면의 갈래 칩과 맞춘 이름. 여기가 곧 사용자가 보는 말이다.
KOREHA = "법무보호공단"
DISTRICT = "주민센터"
MENTAL = "정신건강복지센터"


def _has_point(row: dict[str, object]) -> bool:
    return isinstance(row.get("lat"), (int, float)) and isinstance(row.get("lng"), (int, float))


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
        """그 지역의 기관.

        **주소 문자열로 거른다.** 세 자료의 시도 표기가 서로 달라("서울" · "서울특별시")
        필드를 맞대면 한쪽이 통째로 빠진다. 주소에는 어느 쪽 표기든 들어 있다.

        **공단 기관은 지역이 안 맞아도 남긴다.** 전국에 서른여덟 곳뿐이라 시군구로
        거르면 사라지고, 그러면 주 경로가 지도에서 없어진다.
        """
        # "서울특별시" · "서울" 어느 쪽으로 와도 맞도록 짧은 쪽을 기준 삼는다.
        head = sido.strip()[:2]
        town = district.strip()

        found: list[Center] = []
        for c in self._items:
            if c.category == KOREHA:
                found.append(c)
            elif head and town and head in c.address and town in c.address:
                found.append(c)
        return found
