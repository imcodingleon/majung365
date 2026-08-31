// 지도 탭이 쓸 기관 목록.
//
// **`/api/centers`만 부른다.** 좌표(`lat`·`lng`)를 주는 창구는 여기뿐이다.
// `/api/institutions`와 `/api/district-offices`는 주소만 있어 지도에 점을 찍을 수 없다.
//
// 서버 데이터에 좌표를 채우면(계획 Task 10) 이 창구가 주민센터와 공단 지부까지 함께
// 돌려준다. 그전까지는 법무보호공단 여덟 곳만 뜬다.
//
// **예선의 `useCenters`를 되살리지 않았다.** 그쪽은 서버가 안 되면 `demoCenters.ts`의
// 시연용 고정 데이터로 넘어가는데, 본선에서 없는 기관을 있는 것처럼 보여주면
// 사용자가 헛걸음한다. 못 불러오면 못 불러왔다고 말한다.
import { useEffect, useState } from "react";

import { useRegionLookup } from "@/shared/location";
import { getCenters } from "@/shared/utils/api";
import { getSession } from "@/shared/utils/session";
import type { Center } from "@/shared/types";

export function useNearbyCenters() {
  const lookup = useRegionLookup();
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 가입할 때 알아낸 곳을 먼저 쓴다. **이미 아는 것을 다시 묻지 않는다.**
  // 화면 안에서 지역을 직접 골랐으면 그쪽이 이긴다 — 사용자가 방금 한 선택이다.
  const place = lookup.place ?? getSession()?.place ?? null;

  const sido = place?.sido;
  const district = place?.district;
  // **좌표가 있으면 그 자리에서 거리를 잰다** (2026-08-26 결정 F-1). 지역을 직접
  // 고른 경우에는 없다 — 그때는 서버가 동네 한가운데로 가늠한다.
  const lat = place?.lat;
  const lng = place?.lng;

  useEffect(() => {
    // **지역이 정해지기 전에는 부르지 않는다.** 지역 없이 부르면 전국 목록이 오는데,
    // 지금 서버는 좌표가 있는 것만 3,839건 들고 있다.
    //
    // **시·군·구는 없어도 부른다** (2026-08-31). 전에는 둘 다 있어야 불렀는데, 지역
    // 선택 화면이 시·도만 고르고 넘어가는 길을 열면서 그 경우 이 자리를 그냥 빠져나가
    // **화면이 "불러오는 중"에 영영 머물렀다.**
    //
    // **서버가 그 경우를 받는지 확인했다** (2026-08-31). 확인해 보니 안 받고 있었다 —
    // 시·군·구가 없으면 조회가 수도권 다섯 곳짜리 다른 자료로 빠져 부산 사용자에게
    // 서울 지부가 나갔다. 서버를 함께 고쳤고(`centers/adapter/.../router.py`), 지금은
    // 시·군·구가 비면 그 시·도 전체에서 갈래마다 가까운 순 세 곳씩 돌려준다.
    if (!sido) return;

    let alive = true;
    void (async () => {
      try {
        // 갈래를 고르지 않고 그 지역 전부를 받는다. 거르는 일은 화면의 칩이 한다.
        const all = await getCenters({ sido, district: district ?? "", lat, lng });
        if (alive) setCenters(all);
      } catch {
        if (alive) setError("기관을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [sido, district, lat, lng]);

  return { centers, loading, error, place, pick: lookup.pick };
}
