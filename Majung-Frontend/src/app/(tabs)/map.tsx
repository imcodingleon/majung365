// 지도 탭 — 센터 찾기 (§5.4). 구현은 `features/centers`에 있다.
//
// 위치를 못 받으면 화면이 지역 고르기로 넘어간다. 그 판단도 `MapScreen`이 한다 —
// 라우트는 조립만 한다.
import { MapScreen } from "@/features/centers";

export default function MapRoute() {
  return <MapScreen />;
}
