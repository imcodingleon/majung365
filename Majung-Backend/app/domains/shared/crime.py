"""수용 사유 대분류 — 순수 Python (Domain).

`account`가 저장하고 `knowledge`가 안내를 고르는 데 쓴다. 두 도메인이 함께 보는
값이라 어느 한쪽에 두면 반대쪽이 그 도메인을 import하게 된다 — `routes.py`가
같은 이유로 여기 있다.

**화면에 "죄목"이라고 쓰지 않는다. "수용 사유"다** (copy-voice.md).
코드에서는 저장소 이름과 컬럼이 이미 crime이라 그대로 두고, 사람이 읽는 자리만 가른다.
"""

# 수용 사유 대분류. **"말하고 싶지 않아요"(undisclosed)는 여기 없다.**
# 말하지 않겠다고 한 것을 "말하지 않음"이라는 값으로 저장하면 그것도 하나의
# 기록이 된다(§9.1 데이터 최소화). 프론트는 그 경우 필드 자체를 빼고 보낸다.
CRIME_CATEGORIES = frozenset({
    "violent",   # 폭력·강력범죄
    "sexual",    # 성범죄
    "property",  # 재산·경제범죄
    "drug",      # 마약·중독범죄
    "other",     # 기타범죄
})

# 사람이 읽는 이름. **화면과 LLM 입력에 함께 쓴다.**
#
# 코드값을 그대로 모델에 보내면 "property"를 재산으로 읽을지 부동산으로 읽을지
# 모른다. 화면에 나갈 때도 같은 표기를 써야 카드 문구와 대화가 어긋나지 않는다.
CRIME_LABELS: dict[str, str] = {
    "violent": "폭력·강력범죄",
    "sexual": "성범죄",
    "property": "재산·경제범죄",
    "drug": "마약·중독범죄",
    "other": "기타범죄",
}


def crime_label(category: str) -> str:
    """모르는 값이면 빈 문자열이다. **코드값을 화면에 흘리지 않는다** —
    "property"가 카드에 뜨면 그것도 수용 사유 노출이고, 읽을 수도 없다."""
    return CRIME_LABELS.get(category, "")
