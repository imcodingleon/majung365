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

  useEffect(() => {
    // **지역이 정해지기 전에는 부르지 않는다.** 지역 없이 부르면 전국 목록이 오는데,
    // 지금 서버는 좌표가 있는 것만 3,839건 들고 있다.
    if (!sido || !district) return;

    let alive = true;
    void (async () => {
      try {
        // 갈래를 고르지 않고 그 지역 전부를 받는다. 거르는 일은 화면의 칩이 한다.
        const all = await getCenters({ sido, district });
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
  }, [sido, district]);

  return { centers, loading, error, place, pick: lookup.pick };
}
