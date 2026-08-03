"""institutions.json 로더 — InstitutionRepository 구현 (Infrastructure).

예선은 정적 JSON. 본선에서 DB Repository로 교체 시 이 파일만 바뀌고 Domain/Application은 불변.
"""

import json
from pathlib import Path

from app.domains.knowledge.domain.entity import Institution
from app.domains.shared.areas import Area

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "institutions.json"


class JsonInstitutionRepository:
    def __init__(self, data_path: Path = _DATA_PATH) -> None:
        raw = json.loads(data_path.read_text(encoding="utf-8"))
        self._items: list[Institution] = [
            Institution(
                id=row["id"],
                area=Area(row["area"]),
                name=row["name"],
                summary_easy=row["summary_easy"],
                where=row["where"],
                docs=tuple(row.get("docs", [])),
                next_step=row.get("next_step", ""),
                deadline=row.get("deadline"),
                source_url=row.get("source_url", ""),
            )
            for row in raw["institutions"]
        ]

    def all(self) -> list[Institution]:
        return list(self._items)

    def by_area(self, area: Area) -> list[Institution]:
        return [i for i in self._items if i.area == area]

    def by_id(self, institution_id: str) -> Institution | None:
        return next((i for i in self._items if i.id == institution_id), None)
