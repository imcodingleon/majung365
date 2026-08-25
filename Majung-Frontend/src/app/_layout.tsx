import "../global.css";

import { ActivityIndicator, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppFrame } from "@/shared/components/AppFrame";
import { COLORS } from "@/shared/theme/colors";
import { useRestoreSession } from "@/shared/utils/useRestoreSession";

// 루트 레이아웃. 본선은 단일 화면 + 아코디언 구조라 탭 네비게이션이 없다.
// 헤더는 각 화면이 직접 그린다(저리터러시 커스텀 UI).
//
// **세션 되살리기가 여기 있다** (§5.2). 화면마다 두면 어느 하나가 빠지고, 진입점에만
// 두면 웹에서 그 화면을 거치지 않는 경로가 생긴다 — `/today`를 열어 둔 채 새로고침하면
// 그 화면이 바로 뜨면서 진입점을 지나지 않는다. 세션이 없으니 가입 화면으로 보내졌고,
// 되살리기는 시도조차 되지 않았다.
export default function RootLayout() {
  const { checking } = useRestoreSession();

  return (
    <SafeAreaProvider>
      <AppFrame>
        {/* 되살리는 동안에는 아무 화면도 그리지 않는다. 그리면 세션이 없는 상태로
            한 번 판단이 내려져, 되살아나기 전에 가입 화면으로 넘어가 버린다 */}
        {checking ? (
          <View className="flex-1 items-center justify-center bg-page">
            <ActivityIndicator size="large" color={COLORS.brand} />
            <Text className="mt-4 text-body text-ink-sub">하시던 것을 불러오고 있어요…</Text>
          </View>
        ) : (
          <Stack screenOptions={{ headerShown: false }} />
        )}
      </AppFrame>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
