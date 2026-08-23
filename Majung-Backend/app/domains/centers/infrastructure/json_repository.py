"""centers.json 로더 — 지원기관 Repository 구현 (Infrastructure).

**검수하지 않은 자료를 사용자에게 보내지 않는다.** 주소가 "(상세 주소 검수
필요)"인 예시 세 건이 이 API로 나가고 있었다. 화면이 그 API를 안 써서
드러나지 않았을 뿐, 붙이는 순간 사용자가 그 주소로 찾아간다.

출소 직후에 헛걸음하는 것은 이 서비스가 가장 피하려는 결과다.
"""

import json
from pathlib import Path

from app.domains.centers.domain.entity import Center

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "centers.json"


class JsonCenterRepository:
    def __init__(self, data_path: Path = _DATA_PATH) -> None:
        raw = json.loads(data_path.read_text(encoding="utf-8"))
        self._items: list[Center] = [
            Center(
                id=row["id"],
                category=row["category"],
                name=row["name"],
                address=row["address"],
                phone=row["phone"],
                hours=row["hours"],
                lat=float(row["lat"]),
                lng=float(row["lng"]),
                tags=tuple(row.get("tags", [])),
            )
            for row in raw["centers"]
        ]
        self._reject_unverified()

    def _reject_unverified(self) -> None:
        """검수 표시가 남은 자료는 부팅을 멈춘다.

        **경고로 두면 아무도 안 본다.** 실제로 이 데이터가 여덟 달 가까이
        예시인 채로 API에 나가고 있었고, 문구를 다듬다 우연히 발견됐다.
        """
        marks = ("예시", "검수 필요", "TODO", "확인 필요")
        bad = [
            i.name
            for i in self._items
            if any(m in i.name or m in i.address for m in marks)
        ]
        if bad:
            raise ValueError(
                f"검수하지 않은 기관 자료가 있다 — 지우거나 채운 뒤 띄운다: {bad}"
            )

    def all(self) -> list[Center]:
        return list(self._items)

    def by_category(self, category: str) -> list[Center]:
        return [c for c in self._items if c.category == category]
