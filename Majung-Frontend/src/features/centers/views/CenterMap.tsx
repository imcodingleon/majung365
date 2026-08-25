// 기본(네이티브/타입체크)용 — 폴백 패널. 웹은 CenterMap.web.tsx(실지도)가 우선 해석됨.
// 본선 네이티브 실지도는 react-native-maps로 CenterMap.native.tsx 추가 예정.
import type { Center } from "@/shared/types";

import { MapFallbackPanel } from "./MapFallbackPanel";

export function CenterMap(_props: { centers: Center[] }) {
  return <MapFallbackPanel />;
}
