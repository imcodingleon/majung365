// 지도 폴백 패널 — 키가 없거나 로드 실패 시. 웹/네이티브 공용.
import { Text, View } from "react-native";

export function MapFallbackPanel() {
  return (
    <View className="h-44 items-center justify-center gap-1 overflow-hidden rounded-2xl border border-line bg-brand-soft lg:h-[420px]">
      <Text className="text-3xl">🗺️</Text>
      <Text className="text-sm font-medium text-brand">지도는 준비 중이에요</Text>
      <Text className="text-xs text-ink-muted">아래 목록에서 센터를 확인하고 바로 연결하세요</Text>
    </View>
  );
}
