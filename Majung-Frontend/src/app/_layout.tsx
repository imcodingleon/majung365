import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

// 루트 레이아웃: 탭 묶음 + 온보딩 스택. 헤더는 각 화면이 직접 그린다(저리터러시 커스텀 UI).
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
      </Stack>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
