"""제도 지식베이스 Entity — 순수 Python (Domain).

카드로 인용되는 제도의 원천. 모델이 이 내용을 지어내지 않고, 서버가 여기서 매칭해 붙인다.
"""

from dataclasses import dataclass, field

from app.domains.shared.routes import RouteId


@dataclass(frozen=True)
class Institution:
    id: str
    # 한 제도가 여러 지원 항목의 근거가 될 수 있다(예: 주민등록 재등록 → R9·R11).
    route_ids: tuple[RouteId, ...]
    # 이 제도가 대표인 항목들. 항목마다 대표는 정확히 하나이고, 카드로 먼저 나가는 것이 대표다.
    # route_ids의 부분집합이며, 근거이기만 하고 대표가 아닌 항목은 여기 들어가지 않는다.
    lead_for: tuple[RouteId, ...]
    name: str
    summary_easy: str
    where: str
    docs: tuple[str, ...] = field(default_factory=tuple)
    next_step: str = ""
    deadline: str | None = None
    source_url: str = ""
