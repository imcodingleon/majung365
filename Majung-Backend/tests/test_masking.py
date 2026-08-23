"""LLM 전송 전 마스킹 계층 — 기획서 §9.3.

이 테스트가 무너지면 죄목을 마스킹하지 않고 보내기로 한 결정의 전제가 무너진다.
"이름과 생년월일을 지우고 나면 누구인지 알 수 없다"가 그 결정의 근거이기 때문이다.
"""

from datetime import date

import pytest

from app.infrastructure.security.masking import (
    MASK_ACCOUNT,
    MASK_ADDRESS,
    MASK_EMAIL,
    MASK_NAME,
    MASK_PHONE,
    MASK_RRN,
    MaskingError,
    Profile,
    age_band,
    assert_masked,
    mask_profile,
    mask_text,
)

_TODAY = date(2026, 8, 23)


# ── 가장 새기 쉬운 구멍: 사용자가 대화 본문에 자기 이름을 적는다 ──


def test_name_in_conversation_is_masked() -> None:
    """가입에서 이름을 받아도 사용자는 대화 중에 그 이름을 다시 적는다."""
    out = mask_text("안녕하세요 저는 김판수입니다", name="김판수")
    assert "김판수" not in out
    assert MASK_NAME in out


def test_name_with_different_spacing() -> None:
    """띄어쓰기가 원본과 다른 경우."""
    assert "김 판수" not in mask_text("제 이름은 김 판수예요", name="김판수")


def test_given_name_only() -> None:
    """성을 빼고 이름만 부르는 경우."""
    out = mask_text("다들 저를 판수라고 불러요", name="김판수")
    assert "판수" not in out


def test_registered_name_with_spaces_still_matches() -> None:
    """가입 때 이름에 공백이 섞여 들어온 경우에도 잡아야 한다."""
    assert "김판수" not in mask_text("김판수 왔습니다", name="김 판수")


def test_surname_only_is_masked() -> None:
    """성만 밝히는 경우. 뒤에 조사가 붙어도 잡아야 한다."""
    assert "강씨" not in mask_text("김가 아니라 강씨예요")
    assert "박씨" not in mask_text("박씨입니다")


def test_surname_with_ga_is_a_known_gap() -> None:
    """'성+가'는 잡지 못한다. 알려진 한계이며 의도한 선택이다.

    '가'는 주격 조사라 "이가 아파요"·"최가 낫다" 같은 문장이 전부 걸린다.
    치통 상담이 "[이름] 아파요"가 되는 쪽이 이 사용자층에게 더 나쁘다.

    이름을 알아도(가입에서 받는다) 이 구멍은 덮이지 않는다 — 이름 변형은
    "김판수"·"김 판수"·"판수"이지 "김가"가 아니기 때문이다. 성 하나만으로는
    사람이 특정되지 않지만 연령대·죄목과 합치면 좁혀지므로, 더 나은 방법이
    필요하면 형태소 분석 같은 다른 수단을 검토해야 한다.
    """
    assert mask_text("이가 아파요") == "이가 아파요"
    assert "김가" in mask_text("김가 아니라 강씨예요", name="김판수")


def test_surname_pattern_does_not_overreach() -> None:
    """성이 아닌 한 글자까지 지우면 문장이 망가진다."""
    for text in ("그 씨앗을 심었어요", "이 씨앗이 좋아요", "농사 씨를 뿌렸어요"):
        assert mask_text(text) == text


def test_name_masking_is_idempotent() -> None:
    """이미 마스킹된 텍스트를 다시 마스킹해도 표식이 겹치지 않는다."""
    once = mask_text("저는 김판수예요", name="김판수")
    assert mask_text(once, name="김판수") == once


# ── 연락처·주소·계좌 ──


@pytest.mark.parametrize(
    "text,mask",
    [
        ("연락처는 010-1234-5678이에요", MASK_PHONE),
        ("제 번호 01012345678", MASK_PHONE),
        ("집전화 02-123-4567", MASK_PHONE),
        ("주민번호 900101-1234567", MASK_RRN),
        ("메일은 test@example.com", MASK_EMAIL),
        ("계좌 110-234-567890으로 보내주세요", MASK_ACCOUNT),
        ("우리 집이 송파구 양재대로 925인데요", MASK_ADDRESS),
        ("서울시 송파구 오금로 12-3 살아요", MASK_ADDRESS),
    ],
)
def test_identifiers_are_masked(text: str, mask: str) -> None:
    out = mask_text(text)
    assert mask in out
    for token in ("010-1234-5678", "01012345678", "900101-1234567", "test@example.com"):
        assert token not in out


def test_public_hotlines_survive() -> None:
    """공공 상담번호는 개인정보가 아니라 맥락이다. 지우면 모델이 무슨 일인지 모른다."""
    text = "129에 전화했는데 1670-7004로 가라고 해서 1577-0199도 걸어봤어요"
    out = mask_text(text)
    assert "129" in out and "1670-7004" in out and "1577-0199" in out


def test_unknown_service_number_is_masked() -> None:
    """공공 목록에 없는 대표번호는 사업장 번호일 수 있어 지운다."""
    assert "1588-9999" not in mask_text("1588-9999로 연락 왔어요")


def test_district_level_location_survives() -> None:
    """시군구까지는 남긴다 — 지원 안내가 지역에 따라 달라지고, 구 단위로는 특정되지 않는다."""
    text = "송파구에 살고 있어요"
    assert mask_text(text) == text


# ── 프로필: 타입으로 막는다 ──


def test_masked_profile_drops_name_entirely() -> None:
    """이니셜이나 성만 남겨도 다른 단서와 합치면 사람이 좁혀진다."""
    masked = mask_profile(
        Profile(name="김판수", birth_date=date(1975, 3, 2), release_date=date(2026, 8, 3)),
        _TODAY,
    )
    assert not hasattr(masked, "name")
    assert "김" not in str(masked)


def test_birth_date_becomes_age_band() -> None:
    masked = mask_profile(Profile(birth_date=date(1975, 3, 2)), _TODAY)
    assert masked.age_band == "50대"


def test_release_date_becomes_elapsed_days() -> None:
    masked = mask_profile(Profile(release_date=date(2026, 8, 3)), _TODAY)
    assert masked.days_since_release == 20
    assert "2026" not in str(masked), "원본 날짜가 어떤 형태로도 남으면 안 된다"


def test_crime_category_passes_through() -> None:
    """죄목은 개인화의 핵심 입력이라 그대로 보낸다 — 위 셋이 지워진다는 전제에서만."""
    masked = mask_profile(Profile(crime_category="재산·경제범죄"), _TODAY)
    assert masked.crime_category == "재산·경제범죄"


def test_age_band_boundaries() -> None:
    assert age_band(date(2026, 8, 24), _TODAY) == "10대 이하"  # 아직 생일 전
    assert age_band(date(1956, 1, 1), _TODAY) == "70대 이상"
    assert age_band(date(1996, 8, 23), _TODAY) == "30대"  # 생일 당일


def test_elapsed_days_does_not_reveal_release_date() -> None:
    """경과 일수만으로는 출소일이 복원되지 않는다 — 오늘 날짜를 함께 알아야 하는데
    그건 마스킹 대상이 아니라 API가 원래 아는 값이다. 다만 원본 날짜 문자열이
    파생값 안에 섞여 나가지 않는 것은 확인해야 한다."""
    masked = mask_profile(Profile(release_date=date(2026, 8, 3)), _TODAY)
    rendered = str(masked)
    for fragment in ("2026-08-03", "20260803", "8월 3일"):
        assert fragment not in rendered


# ── 실패하면 막는다 ──


def test_assert_masked_blocks_unmasked_text() -> None:
    """마스킹을 건너뛴 새 경로는 전송 직전에 막힌다."""
    with pytest.raises(MaskingError):
        assert_masked("연락처는 010-1234-5678입니다")


def test_assert_masked_error_does_not_leak_the_value() -> None:
    """예외 메시지가 로그로 흘러가므로 원문을 담지 않는다."""
    with pytest.raises(MaskingError) as exc:
        assert_masked("주민번호 900101-1234567")
    assert "900101" not in str(exc.value)


def test_assert_masked_passes_masked_text() -> None:
    assert_masked(mask_text("010-1234-5678로 연락주세요"))


def test_assert_masked_allows_hotlines() -> None:
    assert_masked("129로 전화하세요")


def test_empty_text_is_safe() -> None:
    assert mask_text("") == ""
    assert_masked("")


# ── 우리가 모르는 이름 (실 모델 검증에서 발견한 구멍) ──


def test_introduced_name_is_masked_without_knowing_it() -> None:
    """mask_text(name=...)은 아는 이름만 지운다. 그런데 사용자는 우리가 모르는 이름을 적는다 —
    프로필이 아직 없거나, 다른 사람 이름이거나.

    실 모델로 돌려보니 "저는 김판수입니다"가 그대로 나가 답변이 "김판수 님"으로 시작했다.
    """
    out = mask_text("사기로 3년 살고 나왔는데 신분증이 없어요. 저는 김판수입니다.")
    assert "김판수" not in out
    assert MASK_NAME in out


def test_strong_intro_does_not_need_a_known_surname() -> None:
    """"제 이름은 ○○○"은 뒤가 이름임이 구문으로 확실하다. 흔치 않은 성을 놓치면 더 나쁘다."""
    for text in ("제 이름은 박서준이에요", "이름은 최민호라고 합니다", "이름이 남궁민수입니다"):
        assert MASK_NAME in mask_text(text), text


def test_weak_intro_keeps_ordinary_sentences() -> None:
    """"저는 ○○"은 이름이 아닌 말이 훨씬 흔하다. 걸러내지 않으면 문장이 무너진다."""
    for text in (
        "저는 통장이 없어요",
        "저는 출소자입니다",
        "저는 신분증이 없고 집도 없어요",
        "제가 사기로 3년 살았어요",
    ):
        assert mask_text(text) == text, text
