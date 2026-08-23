"""공단 기관·정신건강복지센터 로더 (Infrastructure).

두 파일을 한 목록으로 합친다. 원본 구조가 달라서 그대로 두면 화면이 두 갈래를
따로 다뤄야 하는데, 사용자에게는 "이 일로 갈 수 있는 곳"이라는 하나의 개념이다.
"""

import json
from pathlib import Path

from app.domains.centers.domain.entity import SupportInstitution
from app.domains.centers.domain.region import (
    address_hints_district,
    district_matches,
    normalize_district,
    normalize_sido,
)

_DIR = Path(__file__).resolve().parent.parent / "data"

# 정신건강복지센터 원본에는 이름 칸이 없다. 시군구로 만든다 —
# 화면에 "강남구 정신건강복지센터"로 나가야 어디인지 알 수 있다.
_MENTAL_HEALTH = "mental_health"


class JsonSupportInstitutionRepository:
    def __init__(self, data_dir: Path = _DIR) -> None:
        koreha = json.loads((data_dir / "koreha_branches.json").read_text(encoding="utf-8"))
        mental = json.loads(
            (data_dir / "mental_health_centers.json").read_text(encoding="utf-8")
        )
        self._items: list[SupportInstitution] = [
            SupportInstitution(
                name=row["name"],
                kind=row["kind"],
                sido=row["sido"],
                district=row.get("district", ""),
                address=row["address"],
                phone=row["phone"],
            )
            for row in koreha["items"]
        ] + [
            SupportInstitution(
                name=f"{row['district']} 정신건강복지센터",
                kind=_MENTAL_HEALTH,
                sido=row["sido"],
                district=row["district"],
                address=row["address"],
                phone=row["phone"],
            )
            for row in mental["items"]
        ]

    def all(self) -> list[SupportInstitution]:
        return list(self._items)

    def find(
        self,
        kinds: frozenset[str],
        sido: str | None = None,
        district: str | None = None,
        limit: int = 20,
    ) -> list[SupportInstitution]:
        """종류로 거르고 사용자에게 쓸모 있는 순으로 돌려준다.

        같은 시군구 → 공단 기관 → 같은 시도 → 나머지 순이다.
        좌표를 받지 않으므로(§9.5) 거리를 재지 못하고 행정구역이 겹치는 정도로 가늠한다.
        공단 기관을 앞으로 당기는 이유는 수가 적어서다 — 가까움만으로 줄 세우면
        허그센터 3곳이 정신건강복지센터 246곳에 묻혀 화면에 나오지 않는다.
        """
        matched = [i for i in self._items if i.kind in kinds]

        # **기기가 보내는 이름과 우리 데이터의 이름이 다르다**(§5.4).
        # "서울특별시"로 물으면 "서울"과 안 맞아 지역 센터가 통째로 걸러진다.
        # 실제로 어느 지역에서 물어도 허그상담소 세 곳만 나온 적이 있다.
        asked_sido = normalize_sido(sido)
        asked_district = normalize_district(district)

        # 시도 필터는 지역 센터에만 건다. 공단 기관은 전국에 몇 곳뿐이라
        # 시도로 거르면 그 지역에 없는 순간 사라진다 — 허그센터는 전국 3곳이다.
        if asked_sido:
            matched = [
                i for i in matched if i.kind != _MENTAL_HEALTH or i.sido == asked_sido
            ] or matched

        def rank(inst: SupportInstitution) -> tuple[int, str]:
            local = inst.kind == _MENTAL_HEALTH
            same_sido = bool(asked_sido) and inst.sido == asked_sido
            # ① 같은 시군구의 지역 센터가 가장 가깝다.
            #    한 시에 같은 이름이 여럿이면 주소의 구까지 맞는 것을 앞에 둔다.
            if asked_district and district_matches(inst.district, asked_district):
                closer = address_hints_district(inst.address, asked_district)
                return (0 if closer else 1, inst.name)
            # ②③ 공단 기관은 같은 시도부터. 수가 적어(허그센터 3곳) 지역이 안 맞아도
            #     목록에 남아야 한다 — 지역 센터 수백 곳에 묻히면 주 경로가 안 보인다.
            if not local:
                return (2 if same_sido else 3, inst.name)
            # ④ 같은 시도의 다른 시군구 센터
            return (4 if same_sido else 5, inst.name)

        return sorted(matched, key=rank)[:limit]
