"""legal_constraints.json 로더 — 수용 사유별 법령 제약 (Infrastructure).

**버리는 쪽이 기본이다.** 검수되지 않았거나 확인 날짜가 지난 항목은 읽지 않고
버린다. 법률 안내는 틀리면 사용자가 헛걸음하거나 법을 어기게 되므로, 실수의
방향이 "안 보임"이어야 한다.

다만 **부팅을 멈추지는 않는다** — 데이터 한 줄 때문에 서비스가 안 뜨면 그날의
모든 안내가 함께 사라진다. 버린 것은 로그로 알린다. 값 자체가 잘못된 것(없는
항목 코드, 모르는 effect)만 부팅에서 막는다.
"""

import json
import logging
from datetime import date
from pathlib import Path
from typing import Any

from app.domains.knowledge.domain.legal import (
    EFFECTS,
    RELEVANCES,
    SEVERITIES,
    LegalConstraint,
    LegalSource,
)
from app.domains.shared.crime import CRIME_CATEGORIES
from app.domains.shared.routes import RouteId

logger = logging.getLogger(__name__)

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "legal_constraints.json"


class JsonLegalConstraintRepository:
    def __init__(self, data_path: Path = _DATA_PATH, today: date | None = None) -> None:
        raw = json.loads(data_path.read_text(encoding="utf-8"))
        now = today or date.today()

        parsed = [_parse(row) for row in raw["constraints"]]
        self._validate(parsed)

        kept: list[LegalConstraint] = []
        unreviewed: list[str] = []
        expired: list[str] = []
        for c in parsed:
            if not c.reviewed_by.strip():
                unreviewed.append(c.id)
            elif c.expires_on < now:
                expired.append(c.id)
            else:
                kept.append(c)

        self._constraints = tuple(kept)
        if unreviewed:
            logger.warning(
                "⚖️ 검수되지 않아 화면에 내지 않는 법령 제약 %d건: %s",
                len(unreviewed),
                ", ".join(sorted(unreviewed)),
            )
        if expired:
            logger.warning(
                "⚖️ 확인 날짜가 지나 화면에 내지 않는 법령 제약 %d건: %s — "
                "tools/legal-constraints로 다시 확인해야 한다",
                len(expired),
                ", ".join(sorted(expired)),
            )

    def _validate(self, parsed: list[LegalConstraint]) -> None:
        """값 자체가 잘못된 것은 부팅에서 막는다. 우리 데이터라 조용히 넘길 이유가 없다."""
        ids = [c.id for c in parsed]
        if len(ids) != len(set(ids)):
            raise ValueError("법령 제약 id가 겹친다")

        for c in parsed:
            if c.effect not in EFFECTS:
                raise ValueError(f"{c.id}: 모르는 effect '{c.effect}'")
            if c.severity not in SEVERITIES:
                raise ValueError(f"{c.id}: 모르는 severity '{c.severity}'")
            unknown = c.categories - CRIME_CATEGORIES
            if unknown:
                raise ValueError(f"{c.id}: 모르는 수용 사유 대분류 {sorted(unknown)}")
            if not c.categories:
                raise ValueError(f"{c.id}: 수용 사유 대분류가 비었다")
            for s in c.sources:
                if s.relevance not in RELEVANCES:
                    raise ValueError(f"{c.id}: 모르는 relevance '{s.relevance}'")
            if not c.sources:
                raise ValueError(f"{c.id}: 근거 조문이 없다 — 근거 없는 법률 안내는 내지 않는다")

        # **정반대를 동시에 말하는 데이터는 막는다.** 같은 사람의 같은 항목에
        # "법으로 막혀 있다"와 "해당하지 않는다"가 함께 나가면 무엇을 믿어야 할지 모른다.
        for category in CRIME_CATEGORIES:
            for route in RouteId:
                hit = {
                    c.effect
                    for c in parsed
                    if c.route_id == route.value and category in c.categories
                }
                if "blocked" in hit and "clear" in hit:
                    raise ValueError(
                        f"{category}×{route.value}: blocked와 clear가 동시에 있다"
                    )

    def all(self) -> tuple[LegalConstraint, ...]:
        return self._constraints


def _parse(row: dict[str, Any]) -> LegalConstraint:
    # RouteId로 한 번 통과시킨다 — 결번인 "R5"나 오타는 여기서 ValueError로 멈춘다.
    route = RouteId(row["route_id"])
    return LegalConstraint(
        id=row["id"],
        route_id=route.value,
        categories=frozenset(row.get("categories", [])),
        effect=row["effect"],
        severity=row.get("severity", "normal"),
        headline=row["headline"],
        body=row["body"],
        myth=row.get("myth", ""),
        what_to_do=row.get("what_to_do", ""),
        sources=tuple(
            LegalSource(
                law=s["law"],
                article=s["article"],
                article_title=s.get("article_title", ""),
                quote=s.get("quote", ""),
                url=s.get("url", ""),
                relevance=s["relevance"],
            )
            for s in row.get("legal_basis", [])
        ),
        verified_at=date.fromisoformat(row["verified_at"]),
        reviewed_by=row.get("reviewed_by", ""),
        expires_on=date.fromisoformat(row["expires_on"]),
        applies_without_category=bool(row.get("applies_without_category", False)),
    )
