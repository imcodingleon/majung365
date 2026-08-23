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
            )
            for row in raw["offices"]
        ]
        # 조회가 시군구 단위로만 들어오므로 미리 묶어 둔다 — 매 요청마다 3,555건을 훑지 않는다.
        self._by_sigungu: dict[str, list[DistrictOffice]] = defaultdict(list)
        for office in self._items:
            self._by_sigungu[office.sigungu].append(office)

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
