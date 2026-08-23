// 안내 팜플렛 미리보기 (§2.1·§2.2). 심사·시연용이며 실사용자 진입 경로가 아니다.
import { router } from "expo-router";

import { PamphletScreen } from "@/features/pamphlet";

export default function PamphletRoute() {
  return <PamphletScreen onClose={() => router.back()} />;
}
