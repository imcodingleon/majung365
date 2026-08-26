"""고른 답을 안내 문장의 빈자리에 채운다 — 순수 Python (Domain).

R2(공단 긴급지원)는 용도를 넷으로 묻지만 가는 곳도 신청 절차도 같다. 그래서 카드를
넷으로 나눌 이유가 없다. 대신 **사용자가 실제로 들고 갈 것과 창구에서 할 말**에
고른 용도를 채운다. 그 둘만 용도에 따라 갈리기 때문이다.

    준비물   "돈이 필요한 이유를 보여주는 서류"
             → "병원비가 필요한 것을 보여주는 서류"
    창구에서 "긴급복지지원 신청하러 왔어요"
             → "병원비 때문에 긴급복지지원 신청하러 왔어요"

**여기서 새 사실을 만들지 않는다.** 제도가 요구하는 것("이유를 보여주는 서류")은
그대로 두고 사용자가 답한 이유만 채워 넣는다. "진료비 영수증을 가져가세요"처럼
단정하면 그것은 검증되지 않은 제도 정보가 되고, 틀리면 헛걸음이 된다.
공단이 무엇을 인정하는지는 확인되지 않았다.
"""

from collections.abc import Mapping

from app.domains.shared.routes import RouteId

# Q2-1의 optionId → 문장에 넣을 말.
# 계약: Majung-Frontend/src/features/intake/domain/questions.ts
#
# "월세나 방 구할 돈"이 아니라 "월세나 방값"인 이유는 뒤에 "돈이 필요한"이 이어지면
# 돈이 두 번 나오기 때문이다.
_EXPENSE_PURPOSE: dict[str, str] = {
    "LIVING_EXPENSE": "밥값과 생활비",
    "MEDICAL_EXPENSE": "병원비",
    "HOUSING_EXPENSE": "월세나 방값",
    "CHILD_EDUCATION": "아이 학비",
}

# KB 원문과 **글자까지 같아야** 치환이 걸린다. institutions.json의
# welfare-koreha-emergency.docs에 있는 값이다. 문구를 고치면 여기도 함께 고친다
# (tests/test_purpose.py가 어긋남을 잡는다).
_REASON_DOC = "돈이 필요한 이유를 보여주는 서류"


def _subject_particle(word: str) -> str:
    """받침이 있으면 '이', 없으면 '가'. 조사가 틀리면 기계가 쓴 문장으로 읽힌다."""
    if not word:
        return "가"
    last = word[-1]
    if not ("가" <= last <= "힣"):
        return "가"
    has_final = (ord(last) - 0xAC00) % 28 != 0
    return "이" if has_final else "가"


def _join_korean(words: list[str]) -> str:
    """"병원비와 월세나 방값" — 받침에 따라 과/와를 고른다.

    조사가 틀리면 기계가 쓴 문장으로 읽힌다. 마지막 이음말만 앞 낱말의 받침을 본다.
    """
    if not words:
        return ""
    joined = words[0]
    for word in words[1:]:
        last = joined[-1] if joined else ""
        has_final = "가" <= last <= "힣" and (ord(last) - 0xAC00) % 28 != 0
        joined = f"{joined}{'과' if has_final else '와'} {word}"
    return joined


def expense_purpose(route: RouteId, answers: Mapping[str, object]) -> str | None:
    """이 항목의 안내에 채워 넣을 용도. 채울 것이 없으면 None.

    R2 말고는 채울 자리가 없다. "지금은 필요 없어요"·"잘 모르겠어요"를 골랐으면
    채울 용도 자체가 없으므로 원문을 그대로 둔다.

    **여러 개를 고를 수 있다** (2026-08-26 결정 H-2). 병원비와 월세가 동시에 급한
    사람이 실제로 있고, 하나만 받으면 창구에서 한쪽 서류를 안 들고 가게 된다.
    고른 것을 모두 안내한다 — 챙겨 갈 것이 늘어나도 되돌아오는 것보다 낫다.

    **순서는 문항의 선택지 순서다.** 누른 순서를 따르면 같은 답에 다른 문장이 나온다.
    """
    if route is not RouteId.R2:
        return None
    answer = answers.get("emergencyExpenseType")
    picked = [answer] if isinstance(answer, str) else answer
    if not isinstance(picked, (list, tuple)):
        return None

    chosen = {str(v) for v in picked}
    words = [label for key, label in _EXPENSE_PURPOSE.items() if key in chosen]
    return _join_korean(words) or None


def docs_with_purpose(docs: tuple[str, ...], purpose: str | None) -> tuple[str, ...]:
    """준비물의 '이유' 자리에 고른 용도를 채운다. 나머지 준비물은 건드리지 않는다."""
    if purpose is None:
        return docs
    filled = f"{purpose}{_subject_particle(purpose)} 필요한 것을 보여주는 서류"
    return tuple(filled if d == _REASON_DOC else d for d in docs)


def say_with_purpose(say: str, purpose: str | None) -> str:
    """창구에서 할 말 앞에 용도를 붙인다.

    창구 안내가 없는 기관에는 붙일 자리도 없다. 빈 문자열을 만들어 내지 않는다.
    """
    if purpose is None or not say:
        return say
    return f"{purpose} 때문에 {say}"
