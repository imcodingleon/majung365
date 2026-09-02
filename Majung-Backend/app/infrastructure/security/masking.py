"""LLM 전송 전 마스킹 — 식별정보가 외부 API로 나가지 않게 막는 계층.

기획서 §9.3의 명세를 구현한다. 이 계층이 다른 어떤 방어보다 먼저인 이유는
**죄목을 마스킹하지 않고 보내기로 한 결정이 이 계층에 기대고 있기** 때문이다.

    위험한 것은 죄목 자체가 아니라 죄목과 신원의 결합이다. 이름과 생년월일과
    날짜를 제거하고 나면 API가 받는 것은 "재산·경제범죄 이력이 있고 출소한 지
    20일 지난 50대 어떤 사람"이며, 이것은 누구인지 알 수 없다.

즉 **마스킹이 새면 죄목 전송 결정의 전제가 무너진다.**

설계 원칙 셋:

1. **실패하면 막는다.** 마스킹이 예외를 던지면 전송하지 않는다. 원문이 그대로
   나가는 폴백은 두지 않는다 — 이 계층은 실패했을 때 열려서는 안 되는 문이다.
2. **과잉 마스킹이 누출보다 낫다.** 오탐이 나면 답변이 조금 뭉툭해지지만,
   미탐이 나면 그분의 사회 복귀가 걸린다.
3. **프로필은 타입으로 막는다.** 원본 신원 정보(Profile)를 받는 외부 호출은
   만들지 않는다. 나가는 것은 MaskedProfile뿐이다.

마스킹 대상은 **사용자가 쓴 텍스트**다. 서버가 KB에서 붙이는 '확인된 정보'는
우리가 만든 사실이므로 마스킹하지 않는다 — 거기 담긴 기관 전화번호까지 지우면
안내가 무의미해진다.
"""

import re

from app.domains.shared.hotlines import PUBLIC_HOTLINE_NUMBERS
from app.domains.shared.profile import (  # noqa: F401 — 재수출
    MaskedProfile,
    Profile,
    age_band,
    mask_profile,
)

# 공공 상담·안내 번호. 사용자가 "129에 전화했는데요"라고 쓸 수 있고, 그건 개인정보가
# 아니라 맥락이다. 지우면 모델이 무슨 일이 있었는지 모른다.
# 목록은 domains/shared/hotlines.py 한곳에 둔다 — 두 벌이면 한쪽만 갱신되는 날이 온다.
PUBLIC_HOTLINES = PUBLIC_HOTLINE_NUMBERS

# 마스킹 표식. 무엇이 지워졌는지는 알려준다 — 모델이 "이름을 말했구나"를 알아야
# 대화가 어색해지지 않는다.
MASK_NAME = "[이름]"
MASK_PHONE = "[전화번호]"
MASK_RRN = "[주민등록번호]"
MASK_EMAIL = "[이메일]"
MASK_ADDRESS = "[주소]"
MASK_ACCOUNT = "[계좌번호]"

_MASKS = (MASK_NAME, MASK_PHONE, MASK_RRN, MASK_EMAIL, MASK_ADDRESS, MASK_ACCOUNT)

# 주민등록번호 — 뒷자리 첫 글자는 1~8(내국인·외국인·1900/2000년대).
_RRN = re.compile(r"\d{6}\s*[-–]\s*[1-8]\d{6}")

# 전화번호 셋 모두 **앞뒤 숫자 경계를 요구한다.** 없으면 더 긴 숫자 묶음의 안쪽을
# 전화번호로 잘못 집는다 — 계좌번호 "1002-345-678901" 안의 "02-345-6789"가 유선전화로
# 잡혀 "10[전화번호]01"이 됐다. 계좌번호 전체가 새지는 않았지만 남은 네 자리가
# 계좌번호의 일부이고 표식도 사실과 다르다.
#
# **아래 순서를 바꿔서 고치지 않는다.** 계좌를 먼저 돌리면 "02-123-4567"이 계좌로
# 잡히는 반대 사고가 되돌아온다(_mask_numbers 주석 참고).

# 휴대폰. 구분자 없이 붙여 쓰는 경우(01012345678)까지 잡는다.
_MOBILE = re.compile(r"(?<!\d)01[0-9][\s\-.]?\d{3,4}[\s\-.]?\d{4}(?!\d)")

# 지역번호 유선전화. 02는 국번이 3~4자리다.
_LANDLINE = re.compile(r"(?<!\d)0(?:2|[3-6][1-5])[\s\-.]\d{3,4}[\s\-.]\d{4}(?!\d)")

# 대표번호(15xx·16xx·18xx). 공공 상담번호는 아래에서 되돌린다.
_SERVICE_NUMBER = re.compile(r"(?<!\d)1(?:5|6|8)\d{2}[\s\-.]?\d{4}(?!\d)")

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")

# 이메일 매치 끝에 딸려 들어온 한국어 조사. `\w`가 한글까지 포함해
# "kim@example.com으로"가 통째로 한 덩어리로 잡히고 "으로"가 함께 사라졌다.
_EMAIL_TRAILING_HANGUL = re.compile(r"[가-힣]+$")

# 조사를 떼어낸 나머지가 그래도 이메일 꼴인지 본다.
# **패턴을 ASCII로 좁혀서 고치지 않는다** — 그러면 한글 도메인 주소를 놓치고,
# 그것은 누출 방향이다. 뗀 나머지가 이메일이 아니면 통째로 가린다.
_EMAIL_WITHOUT_TAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]*[A-Za-z0-9]")

# 계좌번호 — 은행마다 자릿수가 달라 형태로만 잡는다. 하이픈으로 끊긴 숫자 묶음 셋.
# 단어 경계(\b) 대신 숫자 경계를 쓴다 — 한국어는 "567890으로"처럼 조사가 바로 붙어
# 숫자와 한글 사이에 \b가 서지 않는다.
_ACCOUNT = re.compile(r"(?<!\d)\d{2,6}-\d{2,6}-\d{2,7}(?!\d)")

# 도로명·지번 주소. 행정구역 뒤에 도로명과 번지가 붙는 형태만 본다 —
# "송파구에 살아요"는 시군구까지라 남기고, "송파구 양재대로 925"는 지운다.
_ADDRESS = re.compile(
    r"[가-힣]+(?:시|군|구)\s+[가-힣0-9]+(?:로|길|동|리)\s*\d+(?:-\d+)?(?:번지)?"
    r"(?:\s*\d+(?:동|호))*"
)

# 성만 밝히는 경우("김씨예요"). 붙여 쓴 '성+씨'만 본다.
# 띄어 쓴 "이 씨"까지 잡으면 "이 씨앗"이 걸리고, '성+가'를 잡으면 "이가 아파요"가 걸린다.
# 치통 상담이 "[이름] 아파요"가 되는 쪽이 이 사용자층에게 더 나쁘다.
_SURNAME_SUFFIX = re.compile(r"(?<![가-힣])([가-힣])씨")

# 자기소개 구문에서 이름을 잡는다. **가입에서 이름을 받기 전에도 막아야 한다** —
# mask_text(name=...)은 아는 이름만 지우는데, 사용자는 우리가 모르는 이름을
# 대화에 적는다(다른 사람 이름이거나, 프로필이 아직 없거나).
#
# 문맥 강도로 둘로 나눈다. "제 이름은"은 뒤가 이름임이 확실하지만,
# "저는"은 "저는 통장이 없어요"처럼 이름이 아닌 말이 훨씬 흔하다.
_STRONG_INTRO = re.compile(
    r"(제?\s?이름은|이름이)\s*([가-힣]{2,4})(?=[\s,.]|이라|라고|입니|이에|예요|이고|인데|$)"
)

# **"인데"·"이고"는 뺐다.** 이름 소개보다 상태 서술에 압도적으로 많이 쓰인다.
#
#     "저 백수인데 일자리 있을까요"   → "저 [이름]인데 일자리 있을까요"
#     "저는 노숙인데 갈 곳이 없어요"  → "저는 [이름]인데 갈 곳이 없어요"
#     "저 신용불량인데 대출 되나요"   → "저 [이름]인데 대출 되나요"
#
# 백(白)·노(盧)·신(申)이 모두 성이라 성 목록 검사를 그대로 통과했다. **모델에
# 가는 것은 마스킹된 쪽**이라 R6(취업)·R1(숙식)·R14(빚) 판정의 유일한 근거가
# 사라진 채로 답이 만들어졌다. 마스킹 강화가 답변을 망가뜨리는 방향으로 작동했다.
#
# "저는 김철수인데요"를 놓치게 된다. 그 대신 아는 이름은 mask_text(name=...)이
# 잡고, 모르는 이름은 "라고/입니다/예요"에서 잡는다. **여기서는 과잉 마스킹이
# 누출보다 낫다는 원칙이 뒤집힌다** — 상태 어휘가 지워지면 안내 자체가 틀린다.
_WEAK_INTRO = re.compile(
    r"(?:저는|저|제가|나는|난)\s*([가-힣]{2,4})(?=이라고|라고|입니다|이에요|예요)"
)

# 이름 자리에 와도 이름이 아닌 말. 성으로 시작해 성 목록 검사를 통과하고,
# 지워지면 상담의 근거가 통째로 사라지는 것들을 모은다.
# **목록은 새는 방향이므로 방어의 전부가 아니라 마지막 겹이다.**
_NOT_A_NAME = frozenset({
    "백수", "노숙", "신용불량", "신용", "무직", "고졸", "중졸", "초졸",
    "장애인", "기초수급", "차상위", "한부모", "미혼", "이혼", "사별",
})

# 서술어로 끝나는 말은 이름이 아니다. "제 이름은 없어요"의 "없어요"가 이름으로
# 잡혀 "제 이름은 [이름]"이 됐다. 강한 문맥은 성 목록을 안 보므로 여기서 막는다.
_PREDICATE_TAIL = ("어요", "아요", "예요", "에요", "네요", "구요", "은데", "습니다", "십니다")

# 이름 뒤에 붙어 "지금 이 사람을 부르는 중"임을 확인해 주는 말.
# **두 글자 이름 변형에만 요구한다** — 아래 _name_pattern 주석 참고.
_NAME_TAILS = (
    "이라고", "라고", "이라는", "라는", "입니다", "이에요", "예요", "이라", "씨", "님",
)

# 흔한 성. 성만 밝히는 경우를 잡되, 성이 아닌 한 글자까지 지우지 않으려면 목록이 필요하다.
_SURNAMES: frozenset[str] = frozenset(
    "강고공곽구권금기김나남노도류마명문민박반방배백변서석선설성소손송신심안양어엄여염"
    "오옥왕용우원위유육윤은이인임장전정제조주지진차채천최추탁편표하한함허현홍황"
)


class MaskingError(Exception):
    """마스킹이 제 역할을 못 했다. 이 예외가 나면 전송하지 않는다."""


# Profile·MaskedProfile은 `app/domains/shared/profile.py`가 정본이다.
# Domain(knowledge·chat)이 이 타입을 쓰는데 여기 두면 안쪽이 바깥쪽을
# import하게 된다. 이 이름으로 가져다 쓰던 곳이 그대로 돌게 다시 내보낸다.


def _mask_numbers(text: str) -> str:
    """전화·주민번호·계좌를 지운다. 공공 상담번호는 남긴다."""
    text = _RRN.sub(MASK_RRN, text)
    # 전화가 계좌보다 먼저다 — 계좌 패턴은 형태만 보기 때문에 "02-123-4567"을 먼저 먹는다.
    text = _MOBILE.sub(MASK_PHONE, text)
    text = _LANDLINE.sub(MASK_PHONE, text)

    def keep_hotline(m: re.Match[str]) -> str:
        raw = m.group(0)
        normalized = re.sub(r"[\s.]", "-", raw)
        return raw if normalized in PUBLIC_HOTLINES else MASK_PHONE

    text = _SERVICE_NUMBER.sub(keep_hotline, text)
    return _ACCOUNT.sub(MASK_ACCOUNT, text)


def _mask_email(m: re.Match[str]) -> str:
    """이메일을 가리되 **뒤에 딸려 온 조사는 돌려준다.**

    "kim@example.com으로 주세요"가 "[이메일] 주세요"가 되어 조사가 사라졌다.
    문장이 무너지지는 않지만 모델이 받는 글이 조금씩 어색해진다.
    """
    raw = m.group(0)
    tail = _EMAIL_TRAILING_HANGUL.search(raw)
    if tail and _EMAIL_WITHOUT_TAIL.fullmatch(raw[: tail.start()]):
        return MASK_EMAIL + tail.group(0)
    return MASK_EMAIL


def _name_pattern(variant: str) -> re.Pattern[str]:
    """이름 변형 하나를 찾는 정규식.

    **앞에 한글이 붙어 있으면 이름이 아니다.** 이름이 "김정민"인 사용자의
    "행정민원실에 다녀왔어요"에서 "정민"이 지워지면 어디를 다녀왔는지가 사라진다.

    **두 글자 변형은 뒤 문맥까지 요구한다.** 두 글자는 일반 낱말과 겹칠 확률이
    훨씬 높다 — "이수"·"보람"·"하나"가 이름인 사용자에게 "교육을 이수했어요"가
    "교육을 [이름]했어요"가 되면 R6 판정의 근거가 통째로 없어진다. 여기서는
    §9.3의 "과잉 마스킹이 누출보다 낫다"가 뒤집힌다(test_review_2026_08_24와 같은 판단).

    세 글자 이상은 앞 경계만 본다. 우연히 일반 낱말과 통째로 겹칠 일이 드물고,
    조사가 무엇이 붙든 잡아야 하기 때문이다.
    """
    body = re.escape(variant)
    if len(variant.replace(" ", "")) >= 3:
        return re.compile(rf"(?<![가-힣]){body}")
    tails = "|".join(_NAME_TAILS)
    return re.compile(rf"(?<![가-힣]){body}(?=[^가-힣]|$|{tails})")


def _name_variants(name: str) -> list[str]:
    """이름이 대화에 나타날 수 있는 형태들.

    "김판수"라면 "김판수"·"김 판수"·"판수"를 잡는다. 사용자가 자기 이름을
    줄여 부르거나 띄어 쓰는 일이 흔하다. 긴 것부터 지워야 짧은 것이 먼저 잡혀
    "김[이름]" 같은 찌꺼기가 남지 않는다.
    """
    cleaned = re.sub(r"\s+", "", name)
    if len(cleaned) < 2:
        return []

    variants = {cleaned, " ".join(cleaned)}
    if len(cleaned) >= 3:
        variants.add(cleaned[0] + " " + cleaned[1:])
        variants.add(cleaned[1:])  # 이름만 부르는 경우
    return sorted(variants, key=len, reverse=True)


def _mask_introductions(text: str) -> str:
    """자기소개로 밝힌 이름을 지운다.

    강한 문맥("제 이름은 ○○○")은 성 목록을 보지 않는다 — 뒤에 오는 것이 이름임이
    구문으로 확실하고, 흔치 않은 성을 놓치면 그게 더 나쁘다.

    약한 문맥("저는 ○○○입니다")은 성 목록으로 한 번 거른다. 걸러내지 않으면
    "저는 출소자입니다"·"저는 학생이고"까지 지워져 문장이 무너진다.
    """

    def strong(m: re.Match[str]) -> str:
        candidate = m.group(2)
        if candidate.endswith(_PREDICATE_TAIL) or candidate in _NOT_A_NAME:
            # "제 이름은 없어요"의 "없어요"는 이름이 아니다.
            return m.group(0)
        return f"{m.group(1)} {MASK_NAME}"

    def weak(m: re.Match[str]) -> str:
        name = m.group(1)
        if name[0] not in _SURNAMES or name in _NOT_A_NAME:
            return m.group(0)
        return m.group(0).replace(name, MASK_NAME)

    text = _STRONG_INTRO.sub(strong, text)
    return _WEAK_INTRO.sub(weak, text)


def _mask_surname_only(text: str) -> str:
    """"김씨"·"박가"처럼 성만 밝히는 경우. 성 목록에 있는 글자일 때만 지운다 —
    한 글자를 무조건 지우면 "이 씨앗"까지 걸린다."""

    def replace(m: re.Match[str]) -> str:
        return MASK_NAME if m.group(1) in _SURNAMES else m.group(0)

    return _SURNAME_SUFFIX.sub(replace, text)


def mask_text(text: str, *, name: str | None = None) -> str:
    """사용자가 쓴 텍스트에서 식별정보를 지운다.

    name을 주면 그 이름의 변형까지 잡는다. 가입에서 받은 이름을 사용자가 대화 중에
    다시 적는 경우가 가장 새기 쉬운 구멍이다.
    """
    if not text:
        return text

    masked = text
    if name:
        # **통째로 치환하지 않는다.** 이름이 일반 낱말에 박혀 있는 경우가 있어
        # 경계를 함께 본다 — 자세한 판단은 _name_pattern 주석에 있다.
        for variant in _name_variants(name):
            masked = _name_pattern(variant).sub(MASK_NAME, masked)
    # 아는 이름을 지운 뒤에도 모르는 이름이 남는다 — 자기소개 구문으로 한 번 더 훑는다.
    masked = _mask_introductions(masked)
    masked = _mask_surname_only(masked)
    masked = _EMAIL.sub(_mask_email, masked)
    masked = _ADDRESS.sub(MASK_ADDRESS, masked)
    return _mask_numbers(masked)


def assert_masked(text: str) -> None:
    """마스킹을 거치지 않은 텍스트가 전송 직전에 남아 있는지 확인하는 안전망.

    mask_text와 같은 패턴을 쓰므로 정상 경로에서는 늘 통과한다. 이 검사가 잡는 것은
    **새 코드 경로가 마스킹을 건너뛴 경우**다. 잊어버릴 수 있는 구조를 두지 않기 위해
    외부 호출 직전에 한 번 더 본다.

    이름은 패턴으로 알 수 없어 여기서 잡지 못한다 — 그건 mask_text의 name 인자가 맡는다.
    """
    for pattern, label in (
        (_RRN, "주민등록번호"),
        (_MOBILE, "휴대폰 번호"),
        (_LANDLINE, "전화번호"),
        (_EMAIL, "이메일"),
        (_ADDRESS, "주소"),
        (_ACCOUNT, "계좌번호"),
    ):
        found = pattern.search(text)
        if found and found.group(0) not in _MASKS:
            # 보안 원칙상 원문을 예외 메시지에도 담지 않는다 — 로그로 흘러간다.
            raise MaskingError(f"마스킹되지 않은 {label}가 전송 직전에 발견됐다")

    for hit in _SERVICE_NUMBER.finditer(text):
        normalized = re.sub(r"[\s.]", "-", hit.group(0))
        if normalized not in PUBLIC_HOTLINES:
            raise MaskingError("마스킹되지 않은 대표번호가 전송 직전에 발견됐다")
