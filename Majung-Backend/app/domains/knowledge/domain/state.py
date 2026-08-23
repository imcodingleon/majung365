"""초기 진단 판정 상태 — 세션이 끊겨도 할 일을 이어서 보기 위한 것 (§5.2).

**답변 원문을 담지 않는다.** 0006 마이그레이션이 정한 것을 그대로 지킨다 — 답변을
상시 저장하면 "오늘 밤 잘 곳이 없다 · 통장이 압류됐다"가 한 줄에 모이고, 그것은
출소 사실보다 구체적인 취약성 목록이 된다.

**대신 판정만 남긴다.** 할 일을 다시 만드는 데 필요한 것은 답변이 아니라
`IntakeVerdict`다. 카드 본문은 지식 베이스에서 나오므로 담지 않는다 — 그래야 지식
베이스가 갱신됐을 때 복원된 화면도 최신 안내를 받는다.
"""

from dataclasses import dataclass, field
from typing import Protocol
from uuid import UUID

from app.domains.knowledge.domain.intake import IntakeVerdict


@dataclass(frozen=True)
class IntakeState:
    """그 사람의 판정과 진행 상황."""

    verdicts: tuple[IntakeVerdict, ...]
    """가입 때 계산된 판정 전부. **마친 것도 빠지지 않는다.**"""

    completed: frozenset[str] = field(default_factory=frozenset)
    """마친 지원 항목의 번호들. 예: {"R9", "R4"}"""


class IntakeStateRepository(Protocol):
    """판정 상태 저장소 포트.

    **실패해도 예외를 밖으로 던지지 않는 것이 원칙이다.** 이 저장이 안 됐다고
    가입이 막히거나 할 일 화면이 멈추면 안 된다 — 복원은 편의이고 가입은 본체다.
    """

    def save(self, user_id: UUID, verdicts: tuple[IntakeVerdict, ...]) -> None:
        """가입 직후 판정을 남긴다. 이미 있으면 덮어쓴다.

        **다시 진단했을 때도 이 경로를 쓴다.** 그때는 완료 목록도 함께 비워진다 —
        상황이 달라져 할 일이 새로 정해진 것이라, 예전에 마친 표시를 그대로 두면
        이번에 처음 나온 항목이 이미 끝난 것으로 보인다.
        """
        ...

    def set_completed(self, user_id: UUID, completed: frozenset[str]) -> None:
        """마친 항목을 갱신한다. **목록 전체를 받는다** — 되돌리기가 있어서
        더하기만으로는 표현되지 않는다."""
        ...

    def by_user(self, user_id: UUID) -> IntakeState | None:
        """복원용. 없으면 None — 저장이 꺼져 있던 때 가입한 사람이 그렇다."""
        ...
