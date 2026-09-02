"""채팅에 실리는 프로필과 수용 사유 제약 (기획서 §9.4 · 2026-09-02 결정).

여기서 지키려는 것 셋이다.

1. **이름·생년월일·출소날짜 원본이 실리지 않는다.** 수용 사유를 보내는 것이 정당한
   근거가 식별 불가능성이라, 마스킹이 새면 그 전제가 무너진다.
2. **모델에게 수용 사유를 말하지 말라고 못 박는다.** 카드에 사유를 내기로 한 결정은
   서버가 쓴 검수된 문장에 대한 것이지 모델 문장에 대한 것이 아니다.
3. **안내 컨텍스트 전체에 마스킹 검사를 걸지 않는다.** 걸면 기관 유선번호에 막혀
   정상 안내가 통째로 사라진다. 누가 "더 안전하게" 고치려 할 때 이 테스트가 말한다.
"""

from datetime import date

import pytest

from app.domains.chat.domain.prompts import build_guidance_context
from app.domains.chat.domain.triage import QuestionType, RoutePriority, TriageResult
from app.domains.chat.domain.user_context import build_profile_block, build_user_context
from app.domains.shared.profile import MaskedProfile, Profile, mask_profile
from app.domains.shared.routes import RouteId
from app.infrastructure.security.masking import MaskingError, assert_masked

_TODAY = date(2026, 9, 2)


def _masked(**over: object) -> MaskedProfile:
    return mask_profile(
        Profile(
            name="김판수",
            birth_date=date(1975, 3, 2),
            release_date=date(2026, 8, 3),
            crime_category="property",
            **over,  # type: ignore[arg-type]
        ),
        _TODAY,
    )


# ── 무엇이 실리고 무엇이 실리지 않는가 ────────────────────────────────


def test_profile_block_drops_identifying_values() -> None:
    block = build_profile_block(_masked())

    assert "김판수" not in block and "판수" not in block
    assert "1975" not in block and "2026-08-03" not in block and "8월 3일" not in block


def test_profile_block_keeps_what_personalization_needs() -> None:
    """**수용 사유가 빠지면 개인화가 성립하지 않는다** — §9.4의 명시적 예외다."""
    block = build_profile_block(_masked())

    assert "50대" in block
    assert "출소 후 30일" in block
    assert "재산·경제범죄" in block


def test_profile_block_is_empty_without_a_profile() -> None:
    """가입 전에도 채팅을 열 수 있다. 없는 것이 정상 경로다."""
    assert build_profile_block(None) == ""
    assert build_profile_block(MaskedProfile()) == ""


def test_profile_block_forbids_mentioning_the_reason() -> None:
    """모델은 사유를 알고 **무엇을 말할지 고르되** 왜 그런지는 말하지 않는다.

    에두른 말까지 막는다 — "그 일 때문에"도 옆에서 보는 사람에게는 노출이다.
    """
    block = build_profile_block(_masked())

    assert "언급하지 마세요" in block
    assert "에두른 말" in block


# ── 마스킹 검사를 어디에 거는가 ────────────────────────────────────────


def test_profile_block_passes_the_masking_check() -> None:
    """열거값과 상수로만 조립하므로 통과가 당연하다. 그게 요점이다 —
    새 코드 경로가 마스킹을 건너뛰면 여기서 걸린다."""
    assert_masked(build_profile_block(_masked()))


def test_guidance_context_must_not_be_checked_as_a_whole() -> None:
    """**안내 컨텍스트 전체에 assert_masked를 걸면 안 된다.**

    서버가 KB에서 붙이는 기관 유선번호가 걸려 MaskingError가 나고, 마스킹은
    fail-closed라 정상 안내가 통째로 막힌다. 누가 "더 안전하게" 고치려 할 때
    왜 안 되는지 이 테스트가 말한다.
    """
    context = build_guidance_context(
        TriageResult(QuestionType.SUPPORT, priorities=(RoutePriority(route=RouteId.R1),)),
        ["공단 경기지부 031-123-4567로 문의하세요"],
    )

    with pytest.raises(MaskingError):
        assert_masked(context)


# ── 프롬프트에 어떻게 실리는가 ─────────────────────────────────────────


def test_profile_block_comes_first_in_user_context() -> None:
    """모델은 위에서부터 읽고 먼저 읽은 것으로 답을 시작한다(prompts.py 머리말)."""
    block = build_profile_block(_masked())

    context = build_user_context(None, None, block)

    assert context.startswith("[이분에 대해 알아 둘 것]")


def test_constraint_lines_forbid_inventing_restrictions() -> None:
    """**이 지시가 없으면 모델이 법률 제약을 상상해서 말한다.**

    수용 사유만 받고 사실 목록을 못 받으면 그렇게 된다. 이 기능의 가장 큰 실패
    모드이며, 없는 제약을 사실처럼 말하면 사용자가 지레 포기한다.
    """
    context = build_guidance_context(
        TriageResult(QuestionType.SUPPORT, priorities=(RoutePriority(route=RouteId.R10),)),
        [],
        constraint_lines=["- 한도제한계좌 안내: 새 계좌가 한도제한계좌로 열릴 수 있습니다"],
    )

    assert "한도제한계좌" in context
    assert "지어내지 마세요" in context


def test_constraint_block_is_absent_without_lines() -> None:
    """제약이 없는 항목이 대부분이다. 빈 블록을 만들지 않는다."""
    context = build_guidance_context(
        TriageResult(QuestionType.SUPPORT, priorities=(RoutePriority(route=RouteId.R13),)),
        [],
    )

    assert "수용 사유에 따라 달라지는 것" not in context
