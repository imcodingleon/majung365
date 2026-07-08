import { Stack } from "expo-router";

// 온보딩 스택 — 탭 진입 전 구조화 질문 5단계(CAP-1a). 화면은 2:726 기준.
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
