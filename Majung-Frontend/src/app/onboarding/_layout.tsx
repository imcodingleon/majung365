import { Stack } from "expo-router";

import { OnboardingAnalysisProvider } from "@/features/onboarding/state/analysis";

// 온보딩 스택 — 탭 진입 전 구조화 질문(CAP-1a) → 분석 로딩 → 오늘의 과제.
// OnboardingAnalysisProvider로 감싸 질문→로딩→과제 3화면이 분석 결과를 공유한다.
export default function OnboardingLayout() {
  return (
    <OnboardingAnalysisProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </OnboardingAnalysisProvider>
  );
}
