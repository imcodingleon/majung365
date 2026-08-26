"""지원 항목(route)과 분야(section) 정의 — 순수 Python (Domain).

triage(우선순위 정리)와 KB(제도 매칭)가 공유하는 표준 코드.
외부 라이브러리 import 금지.

계약: _bmad-output/specs/spec-majung-2nd/intake-contract.md §2
폐기된 6영역(identity·welfare·housing·employment·health·debt)을 대체한다.
한 근거 문서가 여러 항목에 걸치므로, 매칭 단위는 단일 문자열이 아니라 항목 배열이다.
"""

from enum import StrEnum


class RouteId(StrEnum):
    """지원 항목 14개. R5(가족지원)는 폐기했고 번호는 결번으로 남긴다 —
    다시 매기면 기획서('15개 질문')의 모든 참조가 어긋나기 때문이다."""

    R1 = "R1"  # 숙식제공
    R2 = "R2"  # 공단 긴급지원
    R3 = "R3"  # 기초건강지원
    R4 = "R4"  # 주거지원
    # R5 — 가족지원. 폐기(결번). 이 자리를 다른 항목으로 채우지 않는다.
    R6 = "R6"  # 취업·허그일자리
    R7 = "R7"  # 창업지원
    R8 = "R8"  # 심리상담
    R9 = "R9"  # 신분증
    R10 = "R10"  # 통장
    R11 = "R11"  # 주민등록 주소
    R12 = "R12"  # 생계급여
    R13 = "R13"  # 수용·출소증명서
    R14 = "R14"  # 개인회생·파산
    R15 = "R15"  # 의료급여·건강보험


class SectionId(StrEnum):
    """초기 진단의 6분야. 값은 옛 영역 코드(identity·health 등)와 겹치지 않게 S1~S6으로 둔다 —
    문자열을 재사용하면 폐기된 데이터가 조용히 통과해 버그를 숨긴다."""

    S1 = "S1"  # 주거
    S2 = "S2"  # 생계·긴급비용
    S3 = "S3"  # 신분·행정
    S4 = "S4"  # 취업·직업
    S5 = "S5"  # 건강·심리
    S6 = "S6"  # 기타·권리구제


# 할 일 목록에 나오는 순서 (2026-08-26 결정 H-1).
#
# **분야 순서가 아니라 항목 순서다.** 예전에는 "막힌 항목 먼저, 그다음 분야 순서"로
# 정렬했는데, 그 규칙으로는 지금 순서가 나오지 않는다 — 증명서와 신분증(신분·행정)이
# 맨 앞이고 그 뒤에 긴급지원과 생계급여(생계)가 오며, 주민등록과 통장은 다시 뒤로
# 간다. 분야가 뒤섞이므로 항목 하나하나를 적는 수밖에 없다.
#
# **누가 들어와도 순서가 같다.** 사람마다 순서가 달라지면 "1번부터 하세요"라는 안내를
# 화면 밖에서 할 수 없고, 담당자와 통화하면서 몇 번을 보라고 말하기도 어렵다.
#
# `blocks_others`는 이 정렬에서 빠졌지만 값은 그대로 쓴다 — 카드의 "먼저 하면 좋아요"
# 배지와 §5.2의 탭 잠금이 그 값을 본다.
ROUTE_ORDER: tuple[RouteId, ...] = (
    RouteId.R13,  # 수용·출소증명서 — 이것이 없으면 뒤가 전부 막힌다
    RouteId.R9,   # 신분증
    RouteId.R2,   # 공단 긴급지원
    RouteId.R12,  # 생계급여
    RouteId.R1,   # 숙식제공
    RouteId.R4,   # 주거지원
    RouteId.R11,  # 주민등록 주소
    RouteId.R10,  # 통장
    RouteId.R6,   # 취업·허그일자리
    RouteId.R7,   # 창업지원
    RouteId.R3,   # 기초건강지원
    RouteId.R8,   # 심리상담
    RouteId.R14,  # 개인회생·파산
    RouteId.R15,  # 의료급여·건강보험
)


def order_of(route_id: RouteId) -> int:
    """목록에서 몇 번째인가. **모르는 항목은 맨 뒤로 보낸다.**

    항목이 새로 생겼는데 `ROUTE_ORDER`에 안 넣으면 조용히 사라지는 것이 가장 나쁘다.
    뒤에라도 남으면 화면에서 보이고, 부팅 검사가 그것을 로그로 알린다.
    """
    try:
        return ROUTE_ORDER.index(route_id)
    except ValueError:
        return len(ROUTE_ORDER)


ROUTE_LABELS: dict[RouteId, str] = {
    RouteId.R1: "숙식제공",
    RouteId.R2: "공단 긴급지원",
    RouteId.R3: "기초건강지원",
    RouteId.R4: "주거지원",
    RouteId.R6: "취업·허그일자리",
    RouteId.R7: "창업지원",
    RouteId.R8: "심리상담",
    RouteId.R9: "신분증",
    RouteId.R10: "통장",
    RouteId.R11: "주민등록 주소",
    RouteId.R12: "생계급여",
    RouteId.R13: "수용·출소증명서",
    RouteId.R14: "개인회생·파산",
    RouteId.R15: "의료급여·건강보험",
}

# 인덱스 탭에 들어가는 짧은 이름. **5자까지 들어가고 6자부터 잘린다**(탭 폭 제약).
# 제도명이 아니라 사용자가 겪는 일로 적는다 — 탭은 자기 상황을 알아보는 자리라
# "개인회생"보다 "빚 문제"가 빨리 읽힌다.
ROUTE_TAB_LABELS: dict[RouteId, str] = {
    RouteId.R1: "거처",
    RouteId.R2: "지원금",
    RouteId.R3: "건강",
    RouteId.R4: "집 구하기",
    RouteId.R6: "일자리",
    RouteId.R7: "창업",
    RouteId.R8: "마음상담",
    RouteId.R9: "신분증",
    RouteId.R10: "통장",
    RouteId.R11: "주민등록",
    RouteId.R12: "생계급여",
    RouteId.R13: "증명서",
    RouteId.R14: "빚 문제",
    RouteId.R15: "병원비",
}

SECTION_LABELS: dict[SectionId, str] = {
    SectionId.S1: "주거",
    SectionId.S2: "생계·긴급비용",
    SectionId.S3: "신분·행정",
    SectionId.S4: "취업·직업",
    SectionId.S5: "건강·심리",
    SectionId.S6: "기타·권리구제",
}

ROUTE_SECTION: dict[RouteId, SectionId] = {
    RouteId.R1: SectionId.S1,
    RouteId.R4: SectionId.S1,
    RouteId.R11: SectionId.S1,
    RouteId.R2: SectionId.S2,
    RouteId.R12: SectionId.S2,
    RouteId.R9: SectionId.S3,
    RouteId.R10: SectionId.S3,
    RouteId.R6: SectionId.S4,
    RouteId.R7: SectionId.S4,
    RouteId.R3: SectionId.S5,
    RouteId.R8: SectionId.S5,
    RouteId.R13: SectionId.S6,
    RouteId.R14: SectionId.S6,
    RouteId.R15: SectionId.S6,
}


def label_for(route: RouteId) -> str:
    return ROUTE_LABELS[route]


def tab_label_for(route: RouteId) -> str:
    return ROUTE_TAB_LABELS[route]


def section_label_for(section: SectionId) -> str:
    return SECTION_LABELS[section]


def section_of(route: RouteId) -> SectionId:
    return ROUTE_SECTION[route]


def routes_in(section: SectionId) -> tuple[RouteId, ...]:
    """분야에 속한 지원 항목들. RouteId 선언 순서를 그대로 따른다."""
    return tuple(r for r in RouteId if ROUTE_SECTION[r] == section)


# 지원 항목마다 갈 수 있는 기관의 종류. **"가까운 공단"에 교육원이 나오면 헛걸음이다.**
# 여기 없는 항목은 공단 기관이 아니라 주민센터·은행·법원으로 간다 —
# 그쪽은 district_offices 조회와 카드의 창구 안내가 맡는다.
ROUTE_INSTITUTION_KINDS: dict[RouteId, frozenset[str]] = {
    RouteId.R1: frozenset({"branch", "head"}),  # 숙식제공
    RouteId.R2: frozenset({"branch", "head"}),  # 공단 긴급지원
    RouteId.R3: frozenset({"branch", "head"}),  # 기초건강지원
    RouteId.R4: frozenset({"branch", "head"}),  # 주거지원
    RouteId.R6: frozenset({"training", "branch"}),  # 취업·직업훈련
    RouteId.R7: frozenset({"branch", "head"}),  # 창업지원
    RouteId.R8: frozenset({"hug", "mental_health"}),  # 심리상담
}


def institution_kinds_for(route: RouteId) -> frozenset[str]:
    """그 항목에서 안내할 기관 종류. 없으면 빈 집합 — 조회할 기관이 없는 항목이다."""
    return ROUTE_INSTITUTION_KINDS.get(route, frozenset())
