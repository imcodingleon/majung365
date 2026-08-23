"""지역 이름 정규화 — 순수 Python (Domain).

**기기가 보내는 이름과 우리 데이터의 이름이 다르다.** §5.4가 좌표를 서버로
보내지 않고 기기에서 시군구로 바꿔 보내기로 했는데, 그 결과는 대개 정식 명칭이다.

    기기가 보내는 것    서울특별시 · 부산광역시 · 경기도 · 강원특별자치도
    우리 데이터         서울      · 부산      · 경기   · 강원

맞추지 않으면 조회가 조용히 빈다. 실제로 정신건강복지센터 246곳이 통째로 걸러져
어느 지역에서 물어도 허그상담소 세 곳만 나온 적이 있다. **오류가 아니라 결과가
줄어드는 형태라 화면에서는 "그 지역에 없나 보다"로 읽힌다.**

시군구도 같은 문제가 있다. 광역시의 구는 그대로지만 도의 시는 아래에 구가 또 있다
(수원시 장안구). 기기가 어느 단위까지 주는지 정해져 있지 않아 양쪽 다 받는다.
"""

# 정식 명칭의 꼬리. 긴 것부터 지워야 "특별자치도"가 "도"보다 먼저 걸린다.
_SIDO_SUFFIXES = (
    "특별자치도",
    "특별자치시",
    "광역시",
    "특별시",
    "도",
)

# 줄여도 두 글자가 안 되는 것들. 규칙으로 못 자르므로 표로 둔다.
_SIDO_ALIASES = {
    "충청남": "충남",
    "충청북": "충북",
    "전라남": "전남",
    "전라북": "전북",
    "경상남": "경남",
    "경상북": "경북",
    "강원특별자치": "강원",
    "제주특별자치": "제주",
}


def normalize_sido(raw: str | None) -> str:
    """시도 이름을 데이터와 같은 짧은 형태로.

    이미 짧은 형태로 오면 그대로 돌려준다 — 화면이 무엇을 보내든 받는다.
    """
    if not raw:
        return ""
    name = raw.strip()
    if not name:
        return ""
    for suffix in _SIDO_SUFFIXES:
        if name.endswith(suffix) and len(name) > len(suffix):
            name = name[: -len(suffix)]
            break
    return _SIDO_ALIASES.get(name, name)


# 행정구를 품은 시. 경계 데이터가 "수원시장안구"처럼 붙여 주는데 우리 데이터는
# "수원시 장안구"로 띄어 쓴다. **띄어쓰기 하나로 조회가 통째로 빈다.**
_COMPOUND_CITY_TAIL = ("구",)


def normalize_district(raw: str | None) -> str:
    """시군구 이름. 붙여 쓴 행정구를 띄운다.

    **자르지 않는다.** "수원시 장안구"를 "수원시"로 줄이면 그 반대 방향
    (데이터가 장안구인데 요청이 수원시)을 놓친다. 겹치는지는 부르는 쪽이 본다.

    다만 **띄어쓰기는 맞춘다.** 기기의 경계 데이터가 "수원시장안구"로 주는데
    우리 데이터는 "수원시 장안구"다. 그대로 두면 0건이 나오고, 오류가 아니라
    결과가 비는 형태라 화면에서는 "그 지역에 없나 보다"로 읽힌다.
    """
    name = (raw or "").strip()
    if " " in name or not name.endswith(_COMPOUND_CITY_TAIL):
        return name
    # "수원시장안구" → "수원시 장안구". 시·군 뒤에서 한 번만 끊는다.
    for i, ch in enumerate(name[:-1]):
        if ch in "시군" and i + 1 < len(name):
            return f"{name[: i + 1]} {name[i + 1 :]}"
    return name


def district_matches(data_district: str, asked: str) -> bool:
    """시군구가 같은 곳을 가리키는가.

    **한쪽이 다른 쪽을 품으면 같은 곳으로 본다.** 기기가 "수원시"까지만 줄 수도,
    "수원시 장안구"까지 줄 수도 있는데 어느 쪽이든 수원 사람에게 수원 기관을
    보여주는 것이 맞다.
    """
    if not data_district or not asked:
        return False
    if data_district == asked:
        return True
    return data_district in asked or asked in data_district


def address_hints_district(address: str, asked: str) -> bool:
    """주소가 요청한 시군구를 가리키는가.

    **같은 이름의 기관이 한 시 안에 여럿 있다.** 수원시 정신건강복지센터는 넷이고
    각각 영통구·팔달구·장안구에 있는데, 데이터의 시군구는 전부 "수원시"라
    그것만으로는 구분되지 않는다. 장안구 사람에게 영통구 센터를 안내하면 멀다.

    요청이 "수원시 장안구"처럼 구까지 왔을 때 그 조각이 주소에 있는지 본다.
    시군구 이름 자체("수원시")는 어느 주소에나 있으므로 뒤 조각만 쓴다.
    """
    parts = asked.split()
    if len(parts) < 2 or not address:
        return False
    return parts[-1] in address
