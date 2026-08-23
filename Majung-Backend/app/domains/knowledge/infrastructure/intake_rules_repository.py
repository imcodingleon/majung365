"""intake_rules.json 로더 — 초기 진단 판정 규칙 (Infrastructure)."""

import json
from pathlib import Path

from app.domains.knowledge.domain.intake import IntakeRule
from app.domains.shared.routes import RouteId

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "intake_rules.json"


class JsonIntakeRuleRepository:
    def __init__(self, data_path: Path = _DATA_PATH) -> None:
        raw = json.loads(data_path.read_text(encoding="utf-8"))
        self._rules: tuple[IntakeRule, ...] = tuple(
            IntakeRule(
                route_id=RouteId(row["route_id"]),
                data_key=row["data_key"],
                resolved_options=frozenset(row.get("resolved_options", [])),
                blocked_options=frozenset(row.get("blocked_options", [])),
                lead_by_option=dict(row.get("lead_by_option", {})),
            )
            for row in raw["rules"]
        )
        self._validate()

    def _validate(self) -> None:
        """항목마다 규칙이 정확히 하나여야 한다. 빠지면 그 항목은 어떤 답을 해도
        할 일이 되지 않고, 겹치면 같은 할 일이 두 번 나온다."""
        routes = [r.route_id for r in self._rules]
        if len(routes) != len(set(routes)):
            raise ValueError("한 지원 항목에 판정 규칙이 둘 이상이다")
        missing = sorted(r.value for r in RouteId if r not in set(routes))
        if missing:
            raise ValueError(f"판정 규칙이 없는 지원 항목: {missing}")
        keys = [r.data_key for r in self._rules]
        if len(keys) != len(set(keys)):
            raise ValueError("서로 다른 항목이 같은 문항을 보고 있다")
        for rule in self._rules:
            # 한 답이 "해결됨"과 "막힘"에 동시에 적히면 어느 쪽인지 알 수 없다.
            overlap = rule.resolved_options & rule.blocked_options
            if overlap:
                raise ValueError(
                    f"{rule.route_id.value}의 답 {sorted(overlap)}이 해결과 막힘에 모두 있다"
                )

    def all(self) -> tuple[IntakeRule, ...]:
        return self._rules
