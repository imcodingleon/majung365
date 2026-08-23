"""코드 리뷰 2026-08-24에서 나온 일곱 결함을 다시 열리지 않게 막는다.

**전부 오류를 내지 않고 조용히 틀린 값이 되던 것들이다.** 고치는 것만으로는
부족하고, 되돌아갔을 때 무엇이 깨질지를 여기 적어 둔다.

전문은 `_bmad-output/implementation-artifacts/code-review-2026-08-24.md`에 있다.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.domains.chat.application.usecase import ChatUseCase
from app.domains.chat.domain.triage import (
    NodeState,
    QuestionType,
    RoutePriority,
    TriageResult,
)
from app.domains.shared.clock import KST, to_kst_date, today_kst
from app.domains.shared.routes import RouteId
from app.domains.visit.domain.entity import VisitRequest, VisitStatus
from app.domains.visit.domain.limits import MAX_PER_DAY, check
from app.infrastructure.security.masking import mask_text


@pytest.fixture
def client():  # type: ignore[no-untyped-def]
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


# ── H1. 개인정보 동의 없이 가입되던 것 ──


def test_privacy_consent_kind_is_named_once() -> None:
    """**이름을 한 곳에만 적는다.** 검증 목록과 판정 함수가 다른 값을 보다가
    동의한 죄목이 조용히 버려진 적이 있다. 필수 동의도 같은 구조로 둔다."""
    from app.domains.account.adapter.inbound.api import router
    from app.domains.account.domain.entity import (
        CONSENT_KINDS,
        PRIVACY_CONSENT_KIND,
    )

    assert PRIVACY_CONSENT_KIND in CONSENT_KINDS
    # 어댑터가 도메인의 상수를 가져다 쓰는지 — 문자열을 따로 적으면 갈린다
    assert router.PRIVACY_CONSENT_KIND is PRIVACY_CONSENT_KIND


@pytest.mark.parametrize(
    "consents",
    [
        [],  # 아무 동의도 없이
        [{"kind": "privacy", "agreed": False}],  # 명시적으로 거부하고
        [{"kind": "crime", "agreed": True}],  # 죄목만 동의하고
    ],
)
def test_signup_rejects_without_privacy_consent(client, consents) -> None:
    """**동의 없이 저장하지 않는다.** 받아 두고 나중에 받는 순서는 성립하지 않는다.

    이 검사가 없어서 동의를 하나도 보내지 않아도 이름·생일·출소날짜가 그대로
    암호화 저장되고 200이 나갔다. 죄목 쪽은 동의를 확인하는데 **정작 필수 동의를
    아무도 보지 않았다** — 없는 검사는 실패하지도 않아 눈에 띄지 않는다.
    """
    res = client.post(
        "/api/signup",
        json={
            "name": "무동의",
            "birth_date": "1990-01-01",
            "release_date": "2026-08-01",
            "answers": {},
            "consents": consents,
        },
    )
    assert res.status_code == 400
    assert "동의" in res.json()["detail"]


# ── H2. 마스킹이 상담의 핵심 단어를 이름으로 지우던 것 ──


@pytest.mark.parametrize(
    "text",
    [
        "저 백수인데 일자리 있을까요",
        "저는 노숙인데 갈 곳이 없어요",
        "저 신용불량인데 대출 되나요",
        "제 이름은 없어요",
        "이름이 뭐예요",
    ],
)
def test_masking_keeps_situation_words(text: str) -> None:
    """**백(白)·노(盧)·신(申)이 전부 성이다.** 성 목록 검사를 그대로 통과해
    R6(취업)·R1(숙식)·R14(빚) 판정의 유일한 근거가 지워졌다.

    모델에 가는 것은 마스킹된 쪽이라, 마스킹 강화가 답변을 망가뜨리는 방향으로
    작동했다. **여기서는 과잉 마스킹이 누출보다 낫다는 원칙이 뒤집힌다.**
    """
    assert mask_text(text) == text


@pytest.mark.parametrize(
    "text",
    [
        "저는 김철수라고 합니다",
        "제 이름은 홍길동입니다",
        "저는 박영희예요",
        "이름이 김민수입니다",
    ],
)
def test_masking_still_removes_real_names(text: str) -> None:
    """오검출을 줄이면서 실제 이름은 그대로 지워야 한다 — 완화가 구멍이 되면 안 된다."""
    assert "[이름]" in mask_text(text)


# ── H3. 서버가 UTC 날짜로 '오늘'을 판단하던 것 ──


def test_today_is_korea_not_utc() -> None:
    """**사람이 '오늘'이라고 부르는 날짜다.** UTC 날짜로 세면 한국 시각 자정부터
    오전 9시까지 서버의 오늘이 어제가 된다."""
    assert today_kst() == datetime.now(KST).date()


def test_kst_date_crosses_at_korean_midnight() -> None:
    """한국 시각 08-24 00:30은 UTC로 08-23 15:30이다. 그날은 24일이어야 한다."""
    moment = datetime(2026, 8, 23, 15, 30, tzinfo=UTC)
    assert to_kst_date(moment).isoformat() == "2026-08-24"


def _visit(created_at: datetime) -> VisitRequest:
    return VisitRequest(
        id=uuid4(),
        user_id=uuid4(),
        route_id="R1",
        org_kind="koreha",
        status=VisitStatus.SENT,
        preferred_at_1=created_at + timedelta(days=3),
        preferred_at_2=None,
        prepared_docs=(),
        note="",
        created_at=created_at,
    )


def test_daily_limit_counts_korean_day() -> None:
    """**상한이 한국 시각 오전 9시에 리셋되던 것.**

    밤에 셋을 채운 사람에게 "내일 이어서 보낼 수 있어요"라고 안내하고는 다음 날
    오전 9시까지 막았다. 반대로 새벽에 채운 셋은 전날로 세어져 같은 날 여섯을
    보낼 수 있었다.
    """
    # 한국 시각 8/25 20:00 = UTC 8/25 11:00 — 셋 다 한국 날짜로 25일이다
    sent = [
        _visit(datetime(2026, 8, 25, 11, 0, tzinfo=UTC)) for _ in range(MAX_PER_DAY)
    ]
    # 한국 날짜로 26일에 새로 보낸다 (UTC로는 아직 25일 23시)
    verdict = check(sent, "R2", to_kst_date(datetime(2026, 8, 25, 23, 0, tzinfo=UTC)))
    assert verdict.allowed, "한국 날짜가 바뀌었으면 상한도 풀려야 한다"

    # 같은 날(한국 26일 새벽)에 셋을 채우면 막힌다
    same_day = [
        _visit(datetime(2026, 8, 25, 16, 0, tzinfo=UTC)) for _ in range(MAX_PER_DAY)
    ]
    blocked = check(same_day, "R2", to_kst_date(datetime(2026, 8, 25, 23, 0, tzinfo=UTC)))
    assert not blocked.allowed


# ── H6. 카드에서 연 대화가 사용자가 말한 상태를 되돌리던 것 ──


def test_pinning_a_route_keeps_the_state() -> None:
    """**R10 카드에서 "통장이 압류돼서 못 써요"라고 하면 BLOCKED이 나온다.**

    핀이 그것을 기본값 X로 덮어써서 "계좌를 새로 만드세요" 계열 대표가 나갔다.
    RoutePriority에 state를 둔 이유가 바로 그 시나리오였다.
    """
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(
            RoutePriority(route=RouteId.R10, state=NodeState.BLOCKED),
            RoutePriority(route=RouteId.R1),
        ),
    )
    pinned = ChatUseCase._pin_route(None, triage, "R10")  # type: ignore[arg-type]

    assert pinned.priorities[0].route is RouteId.R10
    assert pinned.priorities[0].state is NodeState.BLOCKED, (
        "핀은 자리만 옮기고 상태는 지켜야 한다"
    )


def test_pinning_an_unjudged_route_still_works() -> None:
    """모델이 안 고른 항목을 고정하는 경우 — 그때는 기본값으로 새로 만든다."""
    triage = TriageResult(
        question_type=QuestionType.SUPPORT,
        priorities=(RoutePriority(route=RouteId.R1),),
    )
    pinned = ChatUseCase._pin_route(None, triage, "R9")  # type: ignore[arg-type]
    assert pinned.priorities[0].route is RouteId.R9
