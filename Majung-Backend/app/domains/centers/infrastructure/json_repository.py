"""centers.json 로더 — 지원기관 Repository 구현 (Infrastructure)."""

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

    def all(self) -> list[Center]:
        return list(self._items)

    def by_category(self, category: str) -> list[Center]:
        return [c for c in self._items if c.category == category]
