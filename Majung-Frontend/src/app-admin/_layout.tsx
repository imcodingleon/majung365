import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppFrame } from "@/shared/components/AppFrame";

// 담당자 앱의 루트 레이아웃 (기획서 §8).
//
// **출소자 루트와 다른 점은 하나다 — 세션을 되살리지 않는다.** 담당자는 토큰을 기기에
// 저장하지 않으므로(§8.3) 되살릴 것이 없고, 넣으면 담당자 앱이 출소자 세션을
// 들여다보는 셈이 된다.
//
// `AppFrame`은 웹에서만 폭을 묶고 앱에서는 아무것도 하지 않는다. 시연 대체 경로인
// 웹 `/admin`과 모양을 맞추려고 그대로 둔다.
export default function AdminRootLayout() {
  return (
    <SafeAreaProvider>
      <AppFrame>
        <Stack screenOptions={{ headerShown: false }} />
      </AppFrame>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
