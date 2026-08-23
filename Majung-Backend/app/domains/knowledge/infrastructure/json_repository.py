"""institutions.json 로더 — InstitutionRepository 구현 (Infrastructure).

예선은 정적 JSON. 본선에서 DB Repository로 교체 시 이 파일만 바뀌고 Domain/Application은 불변.
"""

import json
from pathlib import Path

from app.domains.knowledge.domain.entity import Institution
from app.domains.shared.hotlines import HOTLINES
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
                companion_for=tuple(RouteId(r) for r in row.get("companion_for", [])),
                name=row["name"],
                summary_easy=row["summary_easy"],
                where=row["where"],
                docs=tuple(row.get("docs", [])),
                next_step=row.get("next_step", ""),
                deadline=row.get("deadline"),
                source_url=row.get("source_url", ""),
                benefit_summary=row.get("benefit_summary", ""),
                eligibility=tuple(row.get("eligibility", [])),
                steps=tuple(row.get("steps", [])),
                cautions=tuple(row.get("cautions", [])),
                source_urls=tuple(row.get("source_urls", [])),
                verified_at=row.get("verified_at", ""),
                desk_place=row.get("desk_place", ""),
                desk_say=row.get("desk_say", ""),
                contact_key=row.get("contact_key", ""),
            )
            for row in raw["institutions"]
        ]
        self._leads = self._build_leads()
        self._validate_companions()
        self._validate_contacts()

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

    def _validate_companions(self) -> None:
        """동반 제도가 그 항목의 근거가 맞는지, 대표와 겹치지 않는지 본다."""
        for inst in self._items:
            for route in inst.companion_for:
                if route not in inst.route_ids:
                    raise ValueError(
                        f"{inst.id}의 companion_for에 route_ids에 없는 {route.value}가 있다"
                    )
                if route in inst.lead_for:
                    raise ValueError(
                        f"{inst.id}는 {route.value}의 대표이면서 동반일 수 없다"
                    )

    def _validate_contacts(self) -> None:
        """연락처 키가 공용 목록에 있는지 본다. 목록에 없는 번호는 화면에 내지 않는다 —
        틀린 번호는 헛걸음이 되고, 지부 번호가 대표번호 자리에 들어가면 지역이 어긋난다."""
        for inst in self._items:
            if inst.contact_key and inst.contact_key not in HOTLINES:
                raise ValueError(
                    f"{inst.id}의 연락처 {inst.contact_key}가 공용 목록에 없다"
                )
            if inst.desk_place and not inst.desk_say:
                raise ValueError(
                    f"{inst.id}에 갈 곳만 있고 무슨 말을 할지가 없다"
                )

    def companions_of(self, route: RouteId) -> list[Institution]:
        """대표와 함께 낼 제도들. 대부분의 항목은 비어 있다."""
        return [i for i in self._items if route in i.companion_for]

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
