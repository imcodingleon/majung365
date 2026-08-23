import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

// 루트 레이아웃. 본선은 단일 화면 + 아코디언 구조라 탭 네비게이션이 없다.
// 헤더는 각 화면이 직접 그린다(저리터러시 커스텀 UI).
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
