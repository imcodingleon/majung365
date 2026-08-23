"""담당자 Entity — 순수 Python (Domain).

기획서 §8.2. **담당자 정보는 개인정보로 다루지 않는다**(해커톤 단계 결정) —
업무 계정이고 실명 대신 소속과 표시명만 둔다. 나중에 실명이 들어오면 그때 등급을
다시 잡아야 한다.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from app.domains.shared.routes import RouteId


class OrgKind(StrEnum):
    """어느 기관 사람인가. 방문 요청이 항목(R번호)에 따라 갈리므로 이 값으로 받는다."""

    KOREHA = "koreha"  # 한국법무보호복지공단
    CENTER = "center"  # 주민센터·행정복지센터


# 항목별 담당 기관. 공단 사업이면 공단이, 행정 민원이면 주민센터가 받는다.
# 여기 없는 항목은 은행·법원·병원처럼 우리 담당자가 없는 곳이라 방문 요청 대상이 아니다.
ROUTE_ORG: dict[RouteId, OrgKind] = {
    RouteId.R1: OrgKind.KOREHA,  # 숙식제공
    RouteId.R2: OrgKind.KOREHA,  # 공단 긴급지원
    RouteId.R3: OrgKind.KOREHA,  # 기초건강지원
    RouteId.R4: OrgKind.KOREHA,  # 주거지원
    RouteId.R6: OrgKind.KOREHA,  # 취업·허그일자리
    RouteId.R7: OrgKind.KOREHA,  # 창업지원
    RouteId.R8: OrgKind.KOREHA,  # 심리상담
    RouteId.R9: OrgKind.CENTER,  # 신분증
    RouteId.R11: OrgKind.CENTER,  # 주민등록 주소
    RouteId.R12: OrgKind.CENTER,  # 생계급여
    RouteId.R15: OrgKind.CENTER,  # 의료급여·건강보험
}


def org_for(route: RouteId) -> OrgKind | None:
    """그 항목의 담당 기관. 없으면 방문 요청을 받을 곳이 없다는 뜻이다 —
    R10 통장은 은행, R13은 교정시설, R14는 법원이라 우리 담당자가 없다."""
    return ROUTE_ORG.get(route)


@dataclass(frozen=True)
class Staff:
    id: UUID
    login_id: str
    org_kind: OrgKind
    # 소속 지부. 지부 필터가 켜지면 이 값으로 거른다.
    branch: str
    # 화면에 보이는 이름. 실명이 아니라 "경기지부 담당자" 같은 표시용이다.
    display_name: str


@dataclass(frozen=True)
class StaffSession:
    staff_id: UUID
    expires_at: datetime

    def is_valid(self, now: datetime) -> bool:
        return now < self.expires_at
