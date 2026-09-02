"""할 일 순서 — 모델이 정하고 서버가 검증한다 (2026-09-02 결정).

`SSOT.md` §4.2가 LLM 정렬을 막았던 근거 셋을 여기서 하나씩 지킨다.

1. **같은 입력에 다른 순서가 나온다** → 순서를 매번 묻지 않고 한 번 정해 저장한다.
   `test_order_is_decided_once`가 그것을 잰다.
2. **응답이 느려진다** → 클라이언트가 시간을 재고 물러난다(`claude_client`).
3. **잘못된 순서가 헛걸음시킨다** → `validate_order`가 걸러내고 정해 둔 순서로 간다.

**폴백이 정상 동작이라는 점이 중요하다.** 모델을 못 부르든 답이 어긋나든, 사용자는
2026-08-26에 정한 그 순서를 그대로 본다 — 개인화는 더해지는 것이지 대체하는 것이 아니다.
"""

from dataclasses import replace
from datetime import date

from app.domains.knowledge.application.intake_usecase import IntakeUseCase
from app.domains.knowledge.domain.graph_engine import NodeState, route_precedence
from app.domains.knowledge.domain.intake import IntakeVerdict
from app.domains.knowledge.domain.ordering import (
    checkable_precedence,
    fallback_order,
    parse_order,
    validate_order,
)
from app.domains.knowledge.infrastructure.graph_repository import JsonGraphRepository
from app.domains.knowledge.infrastructure.intake_rules_repository import (
    JsonIntakeRuleRepository,
)
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository
from app.domains.shared.profile import MaskedProfile, Profile, mask_profile, profile_line
from app.domains.shared.routes import ROUTE_ORDER, RouteId, section_of

_PRECEDENCE = checkable_precedence(route_precedence(JsonGraphRepository().nodes()))


def _verdicts(*routes: str) -> tuple[IntakeVerdict, ...]:
    return tuple(
        IntakeVerdict(
            route_id=RouteId(r),
            section_id=section_of(RouteId(r)),
            blocks_others=False,
            state=NodeState.X,
        )
        for r in routes
    )


class _FixedOrderLlm:
    """정해진 답만 돌려주는 가짜. 몇 번 불렸는지 센다."""

    def __init__(self, answer: tuple[str, ...]) -> None:
        self.answer = answer
        self.calls = 0

    async def order_tasks(self, payload: str) -> tuple[str, ...]:
        self.calls += 1
        self.payloads = getattr(self, "payloads", [])
        self.payloads.append(payload)
        return self.answer


def _usecase(llm: object | None = None) -> IntakeUseCase:
    return IntakeUseCase(
        institutions=JsonInstitutionRepository(),
        rules=JsonIntakeRuleRepository().all(),
        graph_nodes=JsonGraphRepository().nodes(),
        order_llm=llm,  # type: ignore[arg-type]
    )


# ── 폴백 — 이것이 정상 동작이다 ────────────────────────────────────────


def test_fallback_is_the_agreed_order() -> None:
    """모델이 없으면 2026-08-26에 정한 그 순서 그대로다 (결정 H-1 회귀)."""
    v = _verdicts("R10", "R13", "R9", "R2")

    assert [r.value for r in fallback_order(v)] == ["R13", "R9", "R2", "R10"]


async def test_no_llm_means_agreed_order() -> None:
    result = await _usecase(None).ordered_verdicts(_verdicts("R10", "R13", "R9"))

    assert [v.route_id.value for v in result] == ["R13", "R9", "R10"]


async def test_empty_answer_falls_back() -> None:
    """모델이 답을 못 만들면 빈 튜플로 온다. 예외로 올리지 않는다."""
    llm = _FixedOrderLlm(())

    result = await _usecase(llm).ordered_verdicts(_verdicts("R10", "R13", "R9"))

    assert [v.route_id.value for v in result] == ["R13", "R9", "R10"]


# ── 검증 — 어긋나면 반쯤 고치지 않고 물러난다 ──────────────────────────


def test_missing_item_is_rejected() -> None:
    v = _verdicts("R13", "R9", "R10")

    assert validate_order(["R13", "R9"], v, _PRECEDENCE) is None


def test_unknown_item_is_rejected() -> None:
    """결번인 R5나 없는 코드가 섞이면 통째로 버린다."""
    v = _verdicts("R13", "R9", "R10")

    assert validate_order(["R13", "R9", "R5"], v, _PRECEDENCE) is None


def test_duplicate_item_is_rejected() -> None:
    v = _verdicts("R13", "R9", "R10")

    assert validate_order(["R13", "R9", "R9"], v, _PRECEDENCE) is None


def test_precedence_violation_is_rejected() -> None:
    """신분증 없이 통장이 먼저 오면 헛걸음한다. 그래프가 그것을 안다."""
    v = _verdicts("R9", "R10")

    assert validate_order(["R10", "R9"], v, _PRECEDENCE) is None
    assert validate_order(["R9", "R10"], v, _PRECEDENCE) is not None


def test_valid_order_passes_through() -> None:
    """선행조건을 지킨 순서는 정해 둔 순서와 달라도 그대로 받는다.

    **개인화가 실제로 일어나는 자리다.** 정해 둔 순서는 R9가 R14보다 앞이지만,
    빚 문제가 급한 사람에게는 뒤집을 수 있어야 한다.
    """
    v = _verdicts("R9", "R14", "R8")

    result = validate_order(["R9", "R14", "R8"], v, _PRECEDENCE)

    assert result is not None
    assert [r.value for r in result] == ["R9", "R14", "R8"]


async def test_rejected_answer_becomes_the_agreed_order() -> None:
    llm = _FixedOrderLlm(("R10", "R9"))  # 선행조건 위반

    result = await _usecase(llm).ordered_verdicts(_verdicts("R9", "R10"))

    assert [v.route_id.value for v in result] == ["R9", "R10"]
    assert llm.calls == 1


async def test_accepted_answer_changes_the_order() -> None:
    llm = _FixedOrderLlm(("R8", "R9", "R14"))

    result = await _usecase(llm).ordered_verdicts(_verdicts("R9", "R14", "R8"))

    assert [v.route_id.value for v in result] == ["R8", "R9", "R14"]


# ── 파싱 ──────────────────────────────────────────────────────────────


def test_parse_reads_the_order_field() -> None:
    assert parse_order('{"order": ["R13", "R9"]}') == ("R13", "R9")


def test_parse_survives_garbage() -> None:
    """모델이 설명을 붙이거나 형식을 어겨도 예외를 내지 않는다."""
    assert parse_order("어떤 설명") == ()
    assert parse_order('{"order": "R13"}') == ()
    assert parse_order("") == ()


# ── 모델에게 보내는 것 ─────────────────────────────────────────────────


async def test_payload_carries_no_identifying_values() -> None:
    """**이름·생년월일·출소날짜 원본이 실리지 않는다** (기획서 §9.4).

    수용 사유 대분류는 그대로 실린다 — 그것이 빠지면 개인화가 성립하지 않는다.
    """
    llm = _FixedOrderLlm(())
    line = profile_line(
        mask_profile(
            Profile(
                name="김판수",
                birth_date=date(1975, 3, 2),
                release_date=date(2026, 8, 3),
                crime_category="property",
            ),
            today=date(2026, 9, 2),
        )
    )

    await _usecase(llm).ordered_verdicts(_verdicts("R9", "R10"), profile_line=line)
    payload = llm.payloads[0]

    assert "김판수" not in payload and "판수" not in payload
    assert "1975" not in payload and "2026-08-03" not in payload
    assert "50대" in payload
    assert "출소 후 30일" in payload
    assert "재산·경제범죄" in payload


def test_profile_line_omits_what_it_does_not_know() -> None:
    """밝히지 않은 것을 "밝히지 않음"이라고 적지 않는다.

    적으면 모델이 그것을 정보로 다뤄 되묻는 말이 나온다. 밝히지 않는 것은
    정당한 선택이고 되물을 일이 아니다(§3.3-⑥).
    """
    line = profile_line(MaskedProfile(age_band="50대", days_since_release=20))

    assert line == "50대 · 출소 후 20일"
    assert "수용 사유" not in line


# ── 결정성 — 저장에서 온다 ─────────────────────────────────────────────


async def test_order_is_decided_once_and_reused() -> None:
    """**결정성을 모델이 아니라 저장에서 얻는다.**

    순서를 정하는 것은 가입·재진단 때뿐이고, 복원은 저장된 판정을 그대로 읽는다.
    부를 때마다 다른 답을 내는 모델이라도 사용자가 보는 순서는 흔들리지 않는다.
    """
    llm = _FixedOrderLlm(("R8", "R9", "R14"))
    intake = _usecase(llm)
    verdicts = _verdicts("R9", "R14", "R8")

    stored = await intake.ordered_verdicts(verdicts)
    assert llm.calls == 1

    # 복원은 저장된 순서를 그대로 카드로 옮긴다. 모델을 다시 부르지 않는다.
    for _ in range(5):
        tasks = intake.from_verdicts(stored)
        assert [t.route_id for t in tasks] == ["R8", "R9", "R14"]
    assert llm.calls == 1


async def test_order_survives_a_completed_item() -> None:
    """마친 항목을 빼도 남은 것의 순서는 그대로다."""
    llm = _FixedOrderLlm(("R8", "R9", "R14"))
    intake = _usecase(llm)

    stored = await intake.ordered_verdicts(_verdicts("R9", "R14", "R8"))
    tasks = intake.from_verdicts(stored, completed=frozenset({RouteId.R9}))

    assert [t.route_id for t in tasks] == ["R8", "R14"]


def test_reordering_keeps_the_verdict_intact() -> None:
    """순서만 바뀌고 판정 내용은 그대로여야 한다 — 용도·지정 제도가 실려 있다."""
    from app.domains.knowledge.domain.ordering import reorder

    v = tuple(
        replace(x, purpose="병원비") if x.route_id == RouteId.R2 else x
        for x in _verdicts("R2", "R9")
    )

    result = reorder(v, (RouteId.R9, RouteId.R2))

    assert [x.route_id.value for x in result] == ["R9", "R2"]
    assert result[1].purpose == "병원비"


# ── 검사에 쓸 수 있는 선행조건 ─────────────────────────────────────────


def test_checkable_pairs_never_contradict_the_fallback() -> None:
    """**폴백이 검사를 통과해야 검사가 뜻을 갖는다.**

    그래프와 정해 둔 순서가 어긋나는 쌍을 검사에 쓰면 무엇을 내놓아도 늘 실패해,
    검사가 있으나 마나가 된다. 어긋나는 쌍의 목록은 test_graph_engine이 고정한다.
    """
    rank = {r.value: i for i, r in enumerate(ROUTE_ORDER)}

    assert all(rank[b] < rank[a] for b, a in _PRECEDENCE)
    assert _PRECEDENCE, "검사할 쌍이 하나도 남지 않았다"
