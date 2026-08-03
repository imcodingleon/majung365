"""KB Repository Port — Domain이 의존하는 인터페이스. 구현은 infrastructure에."""

from typing import Protocol

from app.domains.knowledge.domain.entity import Institution
from app.domains.shared.areas import Area


class InstitutionRepository(Protocol):
    def all(self) -> list[Institution]: ...

    def by_area(self, area: Area) -> list[Institution]: ...

    def by_id(self, institution_id: str) -> Institution | None: ...
