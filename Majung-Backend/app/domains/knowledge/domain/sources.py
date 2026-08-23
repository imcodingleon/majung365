"""출처 표시 문구 — 순수 Python (Domain).

기획서 §6.4. AI 답변에 근거를 표시할 때 **확인 날짜의 주어가 누구인지**가 중요하다.

    fetched_at은 우리가 수집한 날짜이지 기관이 문서를 갱신한 날짜가 아니다.
    "2026년 8월 23일 기준"이라고 쓰면 기관이 그날 확인했다는 뜻으로 읽힌다.

그래서 문구를 서버가 조립한다. 프론트가 날짜만 받아 스스로 문장을 만들면 이 구분이
화면마다 흐려진다. 연락처를 서버가 붙이기로 한 것과 같은 이유다.
"""

from datetime import date

_SERVICE_NAME = "마중365"


def verified_note(verified_at: str) -> str:
    """확인 날짜 안내 문구. 날짜가 없으면 빈 문자열 — 화면은 그때 이 줄을 그리지 않는다.

    형식이 깨진 값이 들어와도 예외를 내지 않고 표시를 포기한다. 출처 표시가 없다고
    안내가 멈추면 안 되고, 잘못된 날짜를 보이는 것보다는 안 보이는 편이 낫다.
    """
    if not verified_at:
        return ""
    try:
        d = date.fromisoformat(verified_at)
    except ValueError:
        return ""
    return f"{_SERVICE_NAME}가 {d.year}년 {d.month}월 {d.day}일에 확인한 내용이에요."
