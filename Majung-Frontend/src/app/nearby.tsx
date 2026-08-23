// 위치 기반 기관 안내 (§5.4).
//
// 기관 목록은 서버가 시군구를 받아 돌려준다. **좌표는 서버에 도달하지 않는다.**
// 그 계약이 아직 정해지지 않아(§12-21과 같은 상황) 지금은 표본으로 화면을 확인한다.
import { useEffect, useState } from "react";
import { router } from "expo-router";

import type { RegionInstitutions } from "@/features/institutions/domain/institution";
import { useRegionLookup } from "@/features/institutions/hooks/useRegionLookup";
import { NearbyScreen } from "@/features/institutions/views/NearbyScreen";

// 개발 확인용 표본. 서버 연결이 붙으면 지운다.
// 값은 tools/build-institutions.py가 뽑은 실제 데이터에서 가져왔다.
const DEMO_RESULT: RegionInstitutions = {
  branches: [
    {
      name: "한국법무보호복지공단 서울동부지부",
      address: "서울특별시 송파구 오금로 509",
      phone: "02-3401-7046",
      kind: "branch",
    },
  ],
  centers: [
    {
      name: "송파구정신건강복지센터",
      address: "송파구 중대로 32길 20, 3층",
      phone: "02-2114-0871",
    },
  ],
  checkedAt: "2026-08-22",
};

export default function NearbyRoute() {
  const lookup = useRegionLookup();
  const [institutions, setInstitutions] = useState<RegionInstitutions | null>(null);

  useEffect(() => {
    if (!lookup.region || lookup.region.sido === "") {
      setInstitutions(null);
      return;
    }
    // 서버 연결이 붙으면 여기서 시군구만 보내고 결과를 받는다.
    setInstitutions(DEMO_RESULT);
  }, [lookup.region]);

  return (
    <NearbyScreen
      state={lookup.state}
      region={lookup.region}
      institutions={institutions}
      onLocate={lookup.locate}
      onPick={lookup.pick}
      onReset={lookup.reset}
      onClose={() => router.back()}
    />
  );
}
