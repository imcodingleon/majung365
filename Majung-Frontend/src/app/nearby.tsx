// 위치 기반 기관 안내 (§5.4).
//
// **좌표는 서버에 도달하지 않는다.** 기기에서 행정동까지 알아내고 좌표는 버린다.
// 서버로 가는 것은 시도·시군구 이름뿐이다.
import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";

import { NearbyScreen } from "@/features/institutions/views/NearbyScreen";
import type { NearbyResult } from "@/features/institutions/domain/institution";
import { useRegionLookup } from "@/shared/location";
import { getSession } from "@/shared/utils/session";
import { ApiError, getDistrictOffices, getInstitutions } from "@/shared/utils/api";

export default function NearbyRoute() {
  const lookup = useRegionLookup();
  const [result, setResult] = useState<NearbyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 가입할 때 알아낸 곳을 먼저 쓴다.
   *
   * **이미 아는 것을 다시 묻지 않는다.** 가입에서 위치를 켠 사람에게 이 화면이 또
   * "지금 있는 곳으로 찾기"를 내밀면, 같은 일을 두 번 시키는 것이다. 화면 안에서
   * 다시 잡았거나 지역을 직접 골랐으면 그쪽이 이긴다 — 사용자가 방금 한 선택이다.
   */
  const place = lookup.place ?? getSession()?.place ?? null;

  useEffect(() => {
    if (!place || !place.district) {
      setResult(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        // **이 화면은 둘러보는 자리라 갈래를 다 봐야 한다.** 서버는 지원 항목으로
        // 묻는 창구여서 한 번으로는 일부만 온다 — R4는 지부, R8은 허그상담소와
        // 정신건강복지센터다. 둘을 합쳐야 그 지역에 있는 것이 다 보인다.
        const [offices, forHousing, forCounsel] = await Promise.all([
          getDistrictOffices(place.sido, place.district),
          getInstitutions("R4", place.sido, place.district),
          getInstitutions("R8", place.sido, place.district),
        ]);
        if (!alive) return;
        // 같은 기관이 두 응답에 다 있을 수 있다. 이름으로 한 번만 남긴다.
        const seen = new Set<string>();
        const institutions = [...forHousing, ...forCounsel].filter((x) => {
          if (seen.has(x.name)) return false;
          seen.add(x.name);
          return true;
        });
        setResult({ offices, institutions });
      } catch (err) {
        if (!alive) return;
        // **빈 목록과 실패를 구별한다.** 실패를 "그 지역에 없음"으로 보여주면
        // 사용자는 있는 기관을 없는 것으로 알고 만다.
        setError(
          err instanceof ApiError ? err.message : "기관을 불러오지 못했어요. 잠시 뒤에 다시 해 주세요.",
        );
        setResult(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [place]);

  const close = useCallback(() => router.back(), []);

  return (
    <NearbyScreen
      state={lookup.state}
      place={place}
      result={result}
      loading={loading}
      error={error}
      onLocate={lookup.locate}
      onPick={lookup.pick}
      onReset={lookup.reset}
      onClose={close}
    />
  );
}
