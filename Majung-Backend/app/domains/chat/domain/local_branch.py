"""사용자가 있는 지역의 공단 기관 — 순수 Python (Domain).

**있는 데이터를 없다고 말하면 안 된다.** `local_office.py`가 주민센터에서 이미 겪은
일이고, 공단 지부에서 그대로 되풀이됐다.

"군포역 근처 법무보호복지공단 어디야?"에 이렇게 답이 나갔다.

> 정확한 지부 전화번호를 확인해보려 했는데, 지금은 검색이 잘 안 되네요.
> `koreha.or.kr`에 들어가시면 '지부/지소 소개'라는 메뉴가 있어요.

그 순간 서버에는 **경기지부 · 031-374-1423 · 경기도 군포시 산본로 822-38**이 있었다.
군포에 사는 사람에게 군포 주소를 두고 홈페이지를 찾아보라고 미룬 것이다.

**웹 검색으로 넘기지 않는다.** 지부 번호는 우리가 사람 손으로 확인한 표(§6.4)이고,
검색으로 나오는 번호는 지역 지부와 시스템 헬프데스크가 섞인다.
"""

from dataclasses import dataclass
from math import cos, radians, sqrt

from app.domains.centers.domain.entity import SupportInstitution

# 한 지역에 여럿이면 몇 개까지 보여줄지. 전부 늘어놓으면 고르기가 더 어렵다.
_MAX_LINES = 4

# 위도 1도는 약 111km다. 경도는 위도에 따라 좁아지므로 코사인을 곱한다.
_KM_PER_DEGREE = 111.0


def _distance_km(
    lat: float, lng: float, other_lat: float | None, other_lng: float | None
) -> float | None:
    """두 점 사이 거리(km). 좌표가 없으면 `None`.

    **정확한 측지 계산을 하지 않는다.** 한 나라 안에서 가까운 순서를 매기는 것이
    목적이라 평면으로 근사해도 순서가 뒤집히지 않고, 계산이 수백 배 가볍다.
    """
    if other_lat is None or other_lng is None:
        return None
    dy = (other_lat - lat) * _KM_PER_DEGREE
    dx = (other_lng - lng) * _KM_PER_DEGREE * cos(radians(lat))
    return sqrt(dy * dy + dx * dx)


@dataclass(frozen=True)
class LocalBranchAnswer:
    """공단 기관 조회 결과. 답변 프롬프트에 넣을 문장으로 낸다."""

    injection: str

    @property
    def found(self) -> bool:
        return bool(self.injection)


def _line(inst: SupportInstitution, km: float | None) -> str:
    phone = f" {inst.phone}" if inst.phone else ""
    # **거리를 함께 낸다.** 이름만으로는 어디가 가까운지 알 수 없다. 한 자리까지만
    # 적는다 — 직선거리라 그보다 정밀하게 적으면 실제보다 정확해 보인다.
    near = f" (약 {km:.0f}km)" if km is not None else ""
    return f"{inst.name}{phone}{near} · {inst.address}"


def answer_for(
    sido: str,
    sigungu: str,
    found: list[SupportInstitution],
    *,
    origin: tuple[float, float] | None = None,
) -> LocalBranchAnswer:
    """찾은 공단 기관을 답변에 넣을 형태로.

    **가까운 곳을 먼저 낸다.** 기준점(`origin`)이 있으면 실제 거리로 줄 세우고,
    없으면 시군구가 주소에 든 것을 앞으로 당긴다.

    기준점은 사용자가 말한 동의 주민센터 좌표다. **사용자 좌표를 받지 않으므로**
    (§5.4) 그 동네의 중심을 대신 쓴다.

    시군구가 맞는 곳이 없어도 비우지 않는다. 공단 기관은 전국에 서른여덟 곳뿐이라
    시군구로 거르면 대개 비고, 그때 "없다"고 답하면 처음 문제로 돌아간다.
    """
    if not found:
        return LocalBranchAnswer(injection="")

    if origin is not None:
        lat, lng = origin
        measured = [(i, _distance_km(lat, lng, i.lat, i.lng)) for i in found]
        # 좌표가 없는 것은 맨 뒤로. 거리를 모르는 것을 가깝다고 할 수 없다.
        measured.sort(key=lambda pair: (pair[1] is None, pair[1] or 0.0, pair[0].name))
        scope = "가까운 순"
    else:
        same_town = [i for i in found if sigungu and sigungu in i.address]
        measured = [(i, None) for i in (same_town or found)]
        scope = "그 시군구에 있는 곳" if same_town else "같은 시도에 있는 곳"

    lines = "\n".join(f"- {_line(i, km)}" for i, km in measured[:_MAX_LINES])
    where = f"{sido} {sigungu}".strip() or "이 지역"

    return LocalBranchAnswer(
        injection=(
            f"[{where} 근처 한국법무보호복지공단 기관 — {scope}]\n"
            f"{lines}\n"
            "**이 목록을 그대로 알려준다.** 우리가 사람 손으로 확인한 자료다.\n"
            "**맨 위가 가장 가깝다.** 순서를 바꾸지 말고 그대로 안내한다.\n"
            "**여기 있는 것을 두고 홈페이지나 대표번호를 찾아보라고 미루지 않는다.**\n"
            "번호를 지어내지도, 검색으로 다른 번호를 가져오지도 않는다."
        )
    )
