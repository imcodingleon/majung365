"""좌표 사이 거리 — 순수 Python (Domain).

**정확한 측지 계산을 하지 않는다.** 한 나라 안에서 가까운 순서를 매기는 것이 목적이라
평면으로 근사해도 순서가 뒤집히지 않고, 계산이 수백 배 가볍다.

**사용자 좌표를 다루지 않는다**(§5.4). 여기 들어오는 것은 기관 좌표와, 사용자가 말한
행정구역에서 유도한 기준점뿐이다.
"""

from math import cos, radians, sqrt

# 위도 1도는 약 111km다. 경도는 위도에 따라 좁아지므로 코사인을 곱한다.
_KM_PER_DEGREE = 111.0

Point = tuple[float, float]


def distance_km(origin: Point, lat: float | None, lng: float | None) -> float | None:
    """기준점에서 그 지점까지 거리(km). 좌표가 없으면 `None`."""
    if lat is None or lng is None:
        return None
    base_lat, base_lng = origin
    dy = (lat - base_lat) * _KM_PER_DEGREE
    dx = (lng - base_lng) * _KM_PER_DEGREE * cos(radians(base_lat))
    return sqrt(dy * dy + dx * dx)
