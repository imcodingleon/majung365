// 위치 기반 기관 안내 (§5.4).
//
// **좌표는 서버에 도달하지 않는다.** 기기에서 행정동까지 알아내고 좌표는 버린다.
// 서버로 가는 것은 시도·시군구 이름뿐이다.
import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";

import { NearbyScreen } from "@/features/institutions/views/NearbyScreen";
import type { NearbyResult } from "@/features/institutions/domain/institution";
import { useRegionLookup } from "@/features/institutions/hooks/useRegionLookup";
import { ApiError, getDistrictOffices, getInstitutions } from "@/shared/utils/api";

export default function NearbyRoute() {
  const lookup = useRegionLookup();
  const [result, setResult] = useState<NearbyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const place = lookup.place;

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
        // 두 창구를 함께 부른다. 주민센터는 동까지, 공단·센터는 지원 항목별로 온다.
        const [offices, institutions] = await Promise.all([
          getDistrictOffices(place.sido, place.district),
          // R8(심리상담)로 물으면 허그상담소와 정신건강복지센터가 함께 온다.
          getInstitutions("R8", place.sido, place.district),
        ]);
        if (!alive) return;
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
