"""graph.json 로더 — C7(그래프 엔진)이 쓰는 노드 맵을 만든다 (Infrastructure).

예선은 정적 JSON. 본선에서 DB로 교체 시 이 파일만 바뀌고 Domain은 불변.
"""

import json
from pathlib import Path
from typing import Any

from app.domains.knowledge.domain.graph_engine import Deadline, GraphNode, ObtainPath, Requirement

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "graph.json"


def _parse_requirement(row: dict[str, Any]) -> Requirement:
    return Requirement(node=row["node"], confidence=row["confidence"], basis=row["basis"])


def _parse_path(row: dict[str, Any]) -> ObtainPath:
    return ObtainPath(
        for_state=tuple(row["for_state"]),
        route_ids=tuple(row.get("route_ids", [])),
        action=str(row["action"]),
        kb_ref=str(row["kb_ref"]),
        where=str(row["where"]),
        docs=tuple(row.get("docs", [])),
        duration_days=int(row["duration_days"]),
        requires=tuple(_parse_requirement(r) for r in row["requires"]),
    )


def _parse_deadline(row: dict[str, Any] | None) -> Deadline | None:
    if row is None:
        return None
    return Deadline(
        text=row["text"],
        confidence=row["confidence"],
        basis=row["basis"],
        urgency=str(row.get("urgency", "tight")),
    )


def _parse_node(row: dict[str, Any]) -> GraphNode:
    return GraphNode(
        id=str(row["id"]),
        name=str(row["name"]),
        route_ids=tuple(str(r) for r in row["route_ids"]),
        tier=str(row["tier"]),
        deadline=_parse_deadline(row.get("deadline")),
        obtain=tuple(_parse_path(p) for p in row["obtain"]),
    )


class JsonGraphRepository:
    def __init__(self, data_path: Path = _DATA_PATH) -> None:
        raw = json.loads(data_path.read_text(encoding="utf-8"))
        self._nodes: dict[str, GraphNode] = {
            row["id"]: _parse_node(row) for row in raw["nodes"]
        }

    def nodes(self) -> dict[str, GraphNode]:
        return dict(self._nodes)

    def core_node_ids(self) -> list[str]:
        return [n.id for n in self._nodes.values() if n.tier == "core"]
