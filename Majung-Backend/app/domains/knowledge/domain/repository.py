"""KB Repository Port — Domain이 의존하는 인터페이스. 구현은 infrastructure에."""

from typing import Protocol

from app.domains.knowledge.domain.entity import Institution
from app.domains.shared.routes import RouteId


class InstitutionRepository(Protocol):
    def all(self) -> list[Institution]: ...

    def by_route(self, route: RouteId) -> list[Institution]: ...

    def lead_of(self, route: RouteId) -> Institution: ...

    def companions_of(self, route: RouteId) -> list[Institution]: ...

    def by_id(self, institution_id: str) -> Institution | None: ...
