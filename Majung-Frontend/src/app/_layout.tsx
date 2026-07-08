import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { RoadmapProvider } from "@/shared/state/roadmap";

// 루트 레이아웃: 탭 묶음 + 온보딩 스택. 헤더는 각 화면이 직접 그린다(저리터러시 커스텀 UI).
// RoadmapProvider로 감싸 챗봇→로드맵 공유 상태를 전 화면에서 접근.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <RoadmapProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
        </Stack>
        <StatusBar style="dark" />
      </RoadmapProvider>
    </SafeAreaProvider>
  );
}
