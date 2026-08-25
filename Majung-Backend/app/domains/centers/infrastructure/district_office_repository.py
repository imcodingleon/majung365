"""district_offices.json 로더 — 읍면동 주민센터 Repository (Infrastructure).

원본은 행정안전부 '읍면동 하부행정기관 현황'이고, 변환 도구는 tools/build_district_offices.py다.
전국 3,555건이라 전체를 한 번에 내보내지 않는다 — 시군구로 걸러 쓴다.
"""

import json
from collections import defaultdict
from pathlib import Path

from app.domains.centers.domain.entity import DistrictOffice
from app.domains.centers.domain.region import (
    district_matches,
    normalize_district,
    normalize_sido,
)

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "district_offices.json"


class JsonDistrictOfficeRepository:
    def __init__(self, data_path: Path = _DATA_PATH) -> None:
        raw = json.loads(data_path.read_text(encoding="utf-8"))
        self._items: list[DistrictOffice] = [
            DistrictOffice(
                sido=row["sido"],
                sigungu=row["sigungu"],
                dong=row["dong"],
                kind=row["kind"],
                name=row["name"],
                zipcode=row["zipcode"],
                address=row["address"],
                # 못 채운 항목은 None이다. 그때는 거리를 못 재고 이름순으로 남는다.
                lat=row.get("lat"),
                lng=row.get("lng"),
            )
            for row in raw["offices"]
        ]
        # 조회가 시군구 단위로만 들어오므로 미리 묶어 둔다 — 매 요청마다 3,555건을 훑지 않는다.
        self._by_sigungu: dict[str, list[DistrictOffice]] = defaultdict(list)
        # 사용자가 자기 입으로 동을 말하는 경우가 있다. §5.4가 "동을 모른다"고 한 것은
        # **위치로 알아내는 경로**를 말한 것이고, 말해 준 동은 그 제약을 받지 않는다.
        self._by_dong: dict[str, list[DistrictOffice]] = defaultdict(list)
        for office in self._items:
            self._by_sigungu[office.sigungu].append(office)
            self._by_dong[office.dong].append(office)

    def count(self) -> int:
        return len(self._items)

    def by_sigungu(self, sigungu: str, sido: str | None = None) -> list[DistrictOffice]:
        """시군구의 읍면동 목록. 시군구 이름은 시도가 달라도 겹치므로(예: 여러 곳의 '중구'),
        시도를 함께 주면 그것으로 좁힌다. 주지 않으면 겹치는 것을 모두 돌려주고,
        각 항목에 sido가 들어 있어 화면에서 구분할 수 있다."""
        # **기기가 보내는 이름과 데이터의 이름이 다르다**(§5.4). "서울특별시"로
        # 물으면 "서울"과 안 맞아 결과가 통째로 빈다 — 오류가 아니라 목록이
        # 줄어드는 형태라 화면에서는 "그 지역에 없나 보다"로 읽힌다.
        asked = normalize_district(sigungu)
        items = self._by_sigungu.get(asked, [])
        if not items and asked:
            # 기기가 "수원시 장안구"까지 줄 수도, "수원시"까지만 줄 수도 있다.
            items = [
                o
                for group in self._by_sigungu.values()
                for o in group
                if district_matches(o.sigungu, asked)
            ]
        asked_sido = normalize_sido(sido)
        if asked_sido:
            items = [o for o in items if o.sido == asked_sido]
        return list(items)

    def by_dong(
        self, dong: str, sido: str | None = None, sigungu: str | None = None
    ) -> list[DistrictOffice]:
        """동 이름으로 찾는다. **같은 이름이 전국에 여럿이다.**

        "중앙동"은 31곳, "남면"은 12곳이다. 시도·시군구를 함께 주면 좁히고,
        주지 않으면 후보를 전부 돌려준다 — **어느 곳인지는 부르는 쪽이 사용자에게
        되물어야 한다.** 서버가 임의로 하나를 고르면 사용자가 엉뚱한 동네
        주민센터로 찾아간다.
        """
        name = normalize_district(dong)
        if not name:
            return []
        found = list(self._by_dong.get(name, []))
        if not found:
            # "오금1동"으로 물었는데 데이터가 "오금동"인 경우처럼 한쪽이 더 자세할 수 있다.
            found = [o for o in self._items if district_matches(o.dong, name)]

        asked_sido = normalize_sido(sido)
        if asked_sido:
            found = [o for o in found if o.sido == asked_sido]
        asked_sigungu = normalize_district(sigungu)
        if asked_sigungu:
            found = [o for o in found if district_matches(o.sigungu, asked_sigungu)]
        return found
