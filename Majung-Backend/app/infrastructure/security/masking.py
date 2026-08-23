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
from dataclasses import dataclass
from datetime import date

from app.domains.shared.hotlines import PUBLIC_HOTLINE_NUMBERS

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

# 휴대폰. 구분자 없이 붙여 쓰는 경우(01012345678)까지 잡는다.
_MOBILE = re.compile(r"01[0-9][\s\-.]?\d{3,4}[\s\-.]?\d{4}")

# 지역번호 유선전화. 02는 국번이 3~4자리다.
_LANDLINE = re.compile(r"0(?:2|[3-6][1-5])[\s\-.]\d{3,4}[\s\-.]\d{4}")

# 대표번호(15xx·16xx·18xx). 공공 상담번호는 아래에서 되돌린다.
_SERVICE_NUMBER = re.compile(r"1(?:5|6|8)\d{2}[\s\-.]?\d{4}")

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")

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
_WEAK_INTRO = re.compile(
    r"(?:저는|저|제가|나는|난)\s*([가-힣]{2,4})(?=이라고|라고|입니다|이에요|예요|인데|이고)"
)

# 흔한 성. 성만 밝히는 경우를 잡되, 성이 아닌 한 글자까지 지우지 않으려면 목록이 필요하다.
_SURNAMES: frozenset[str] = frozenset(
    "강고공곽구권금기김나남노도류마명문민박반방배백변서석선설성소손송신심안양어엄여염"
    "오옥왕용우원위유육윤은이인임장전정제조주지진차채천최추탁편표하한함허현홍황"
)


class MaskingError(Exception):
    """마스킹이 제 역할을 못 했다. 이 예외가 나면 전송하지 않는다."""


@dataclass(frozen=True)
class Profile:
    """사용자 신원 정보. **이 객체는 외부 API로 나가지 않는다.**

    외부 호출에 넘길 때는 반드시 mask_profile()로 MaskedProfile을 만든다.
    """

    name: str | None = None
    birth_date: date | None = None
    release_date: date | None = None
    # 죄목 대분류. 개인화의 핵심 입력이라 그대로 보낸다 — 다만 위 셋이 지워진다는 전제에서만.
    crime_category: str | None = None


@dataclass(frozen=True)
class MaskedProfile:
    """외부 API로 나가도 되는 형태. 원본 날짜와 이름은 들어 있지 않다."""

    age_band: str | None = None  # "50대"
    days_since_release: int | None = None
    crime_category: str | None = None


def age_band(birth: date, today: date) -> str:
    """생일을 연령대로. 제도 판정에는 "50대"면 충분하고 생년월일은 식별정보다."""
    years = today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))
    if years < 20:
        return "10대 이하"
    if years >= 70:
        return "70대 이상"
    return f"{years // 10 * 10}대"


def mask_profile(profile: Profile, today: date) -> MaskedProfile:
    """신원 정보를 외부로 보낼 수 있는 형태로 바꾼다.

    이름은 어떤 형태로도 담지 않는다 — 이니셜이나 성만 남겨도 다른 단서와 합치면
    사람이 좁혀진다. 화면의 인사말은 클라이언트가 붙인다.
    """
    return MaskedProfile(
        age_band=age_band(profile.birth_date, today) if profile.birth_date else None,
        days_since_release=(
            (today - profile.release_date).days if profile.release_date else None
        ),
        crime_category=profile.crime_category,
    )


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
        return f"{m.group(1)} {MASK_NAME}"

    def weak(m: re.Match[str]) -> str:
        name = m.group(1)
        if name[0] not in _SURNAMES:
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
        for variant in _name_variants(name):
            masked = masked.replace(variant, MASK_NAME)
    # 아는 이름을 지운 뒤에도 모르는 이름이 남는다 — 자기소개 구문으로 한 번 더 훑는다.
    masked = _mask_introductions(masked)
    masked = _mask_surname_only(masked)
    masked = _EMAIL.sub(MASK_EMAIL, masked)
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
