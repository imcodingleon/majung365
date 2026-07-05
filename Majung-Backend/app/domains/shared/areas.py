"""6개 지원 영역 정의 — 순수 Python (Domain).

triage(우선순위 정리)와 KB(제도 매칭)가 공유하는 표준 영역 코드.
외부 라이브러리 import 금지.
"""

from enum import StrEnum


class Area(StrEnum):
    IDENTITY = "identity"  # 신분 재건 (신분증·통장·휴대폰 재개통)
    WELFARE = "welfare"  # 긴급복지·생계
    HOUSING = "housing"  # 주거
    EMPLOYMENT = "employment"  # 취업
    HEALTH = "health"  # 의료·마음
    DEBT = "debt"  # 채무


AREA_LABELS: dict[Area, str] = {
    Area.IDENTITY: "신분 재건",
    Area.WELFARE: "긴급복지·생계",
    Area.HOUSING: "주거",
    Area.EMPLOYMENT: "취업",
    Area.HEALTH: "의료·마음",
    Area.DEBT: "채무",
}


def label_for(area: Area) -> str:
    return AREA_LABELS[area]
