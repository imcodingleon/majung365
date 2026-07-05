"""제도 지식베이스 Entity — 순수 Python (Domain).

카드로 인용되는 제도의 원천. 모델이 이 내용을 지어내지 않고, 서버가 여기서 매칭해 붙인다.
"""

from dataclasses import dataclass, field

from app.domains.shared.areas import Area


@dataclass(frozen=True)
class Institution:
    id: str
    area: Area
    name: str
    summary_easy: str
    where: str
    docs: tuple[str, ...] = field(default_factory=tuple)
    next_step: str = ""
    deadline: str | None = None
    source_url: str = ""
