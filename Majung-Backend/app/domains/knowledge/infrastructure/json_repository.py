"""institutions.json 로더 — InstitutionRepository 구현 (Infrastructure).

예선은 정적 JSON. 본선에서 DB Repository로 교체 시 이 파일만 바뀌고 Domain/Application은 불변.
"""

import json
from pathlib import Path

from app.domains.knowledge.domain.entity import Institution
from app.domains.shared.routes import RouteId

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "institutions.json"


class JsonInstitutionRepository:
    def __init__(self, data_path: Path = _DATA_PATH) -> None:
        raw = json.loads(data_path.read_text(encoding="utf-8"))
        self._items: list[Institution] = [
            Institution(
                id=row["id"],
                route_ids=tuple(RouteId(r) for r in row["route_ids"]),
                lead_for=tuple(RouteId(r) for r in row.get("lead_for", [])),
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
        self._leads = self._build_leads()

    def _build_leads(self) -> dict[RouteId, Institution]:
        """항목별 대표를 미리 확정한다. 대표가 없거나 둘 이상이면 부팅을 멈춘다 —
        잘못된 KB로 서비스하면 사용자가 엉뚱한 곳으로 헛걸음한다."""
        leads: dict[RouteId, Institution] = {}
        for inst in self._items:
            for route in inst.lead_for:
                if route not in inst.route_ids:
                    raise ValueError(
                        f"{inst.id}의 lead_for에 route_ids에 없는 {route.value}가 있다"
                    )
                if route in leads:
                    raise ValueError(
                        f"{route.value}의 대표 제도가 둘이다: {leads[route].id}, {inst.id}"
                    )
                leads[route] = inst
        missing = [r.value for r in RouteId if r not in leads]
        if missing:
            raise ValueError(f"대표 제도가 없는 지원 항목: {missing}")
        return leads

    def all(self) -> list[Institution]:
        return list(self._items)

    def by_route(self, route: RouteId) -> list[Institution]:
        """그 항목의 근거가 되는 제도 전부. 대표가 맨 앞에 온다."""
        matched = [i for i in self._items if route in i.route_ids]
        return sorted(matched, key=lambda i: route not in i.lead_for)

    def lead_of(self, route: RouteId) -> Institution:
        """그 항목의 대표 제도. 부팅 시 전 항목에 대해 존재를 확인했다."""
        return self._leads[route]

    def by_id(self, institution_id: str) -> Institution | None:
        return next((i for i in self._items if i.id == institution_id), None)
