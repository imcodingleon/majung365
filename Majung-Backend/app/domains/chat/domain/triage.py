"""triage 결과 값객체 — 순수 Python (Domain)."""

from dataclasses import dataclass
from enum import StrEnum

from app.domains.shared.routes import RouteId


class QuestionType(StrEnum):
    SUPPORT = "support"  # 제도 안내가 필요한 지원 질문 → KB 카드 매칭
    DAILY = "daily"  # 일상·디지털·감정 등 폭넓은 질문 → 자유 답변(+웹 검색 가능)


@dataclass(frozen=True)
class RoutePriority:
    route: RouteId
    reason: str  # 왜 급한지 (쉬운 말)


@dataclass(frozen=True)
class TriageResult:
    question_type: QuestionType
    priorities: tuple[RoutePriority, ...]  # 급한 순, 보통 2~3개 (DAILY면 비어도 됨)
