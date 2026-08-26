"""할 일 목록에 나오는 순서 (2026-08-26 결정 H-1).

**분야 순서가 아니라 항목 순서다.** 예전에는 "막힌 항목 먼저, 그다음 분야 순서"로
정렬했는데, 지금 순서는 분야가 뒤섞여 있어 그 규칙으로 나오지 않는다 — 증명서와
신분증(신분·행정)이 맨 앞이고 그 뒤에 긴급지원과 생계급여(생계)가 오며, 주민등록과
통장은 다시 뒤로 간다.

여기서 지키려는 것 둘이다. **적어 둔 순서를 그대로 따르는가**, 그리고 **목록에서
빠진 항목이 사라지지 않는가**.
"""

from app.domains.knowledge.domain.graph_engine import NodeState
from app.domains.knowledge.domain.intake import IntakeVerdict
from app.domains.shared.routes import ROUTE_ORDER, RouteId, order_of, section_of

# 사용자가 정한 순서다. **여기 적힌 것이 정본이고 코드가 이것을 따른다** —
# 코드에서 읽어와 비교하면 순서가 뒤집혀도 테스트가 함께 뒤집혀 아무것도 못 잡는다.
EXPECTED = [
    "R13",  # 수용·출소증명서
    "R9",   # 신분증
    "R2",   # 공단 긴급지원
    "R12",  # 생계급여
    "R1",   # 숙식제공
    "R4",   # 주거지원
    "R11",  # 주민등록 주소
    "R10",  # 통장
    "R6",   # 취업·허그일자리
    "R7",   # 창업지원
    "R3",   # 기초건강지원
    "R8",   # 심리상담
    "R14",  # 개인회생·파산
    "R15",  # 의료급여·건강보험
]


def test_order_matches_the_agreed_list() -> None:
    assert [r.value for r in ROUTE_ORDER] == EXPECTED


def test_every_route_is_placed() -> None:
    """**빠진 항목은 맨 뒤로 밀릴 뿐 사라지지 않는다.** 그래도 빠뜨리지는 않는다."""
    missing = sorted(r.value for r in RouteId if r not in ROUTE_ORDER)
    assert not missing, f"할 일 순서에 빠진 항목: {missing}"


def test_unknown_route_goes_last() -> None:
    """항목이 새로 생겼는데 목록에 안 넣어도 화면에서 사라지면 안 된다."""

    class Fake:
        value = "R99"

    assert order_of(Fake()) == len(ROUTE_ORDER)  # type: ignore[arg-type]


def _verdict(route: RouteId, *, blocks: bool = False) -> IntakeVerdict:
    return IntakeVerdict(
        route_id=route,
        section_id=section_of(route),
        blocks_others=blocks,
        state=NodeState.X,
        lead_override=None,
        override_is_specific=False,
    )


def test_sorting_follows_the_list() -> None:
    """섞어 넣어도 적어 둔 순서로 나온다."""
    shuffled = [_verdict(r) for r in (RouteId.R15, RouteId.R1, RouteId.R13, RouteId.R6)]
    ordered = sorted(shuffled, key=lambda v: order_of(v.route_id))
    assert [v.route_id.value for v in ordered] == ["R13", "R1", "R6", "R15"]


def test_blocking_does_not_jump_the_queue() -> None:
    """**막힌 항목이라고 앞으로 끌어올리지 않는다** — 누가 들어와도 순서가 같아야 한다.

    `blocks_others` 값 자체는 그대로 쓴다. 카드의 "먼저 하면 좋아요" 배지와 §5.2의
    탭 잠금이 그 값을 본다 — 정렬에서만 빠졌다.
    """
    verdicts = [_verdict(RouteId.R13), _verdict(RouteId.R15, blocks=True)]
    ordered = sorted(verdicts, key=lambda v: order_of(v.route_id))
    assert [v.route_id.value for v in ordered] == ["R13", "R15"]
    # 값은 살아 있다.
    assert ordered[1].blocks_others is True
