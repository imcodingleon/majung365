// 분석 로딩 화면 — 온보딩 답변을 바탕으로 오늘의 과제를 계산하는 동안 보여준다(C6+C7).
// Figma에 정식 목업 없음(화이트보드 스케치만 존재하고, 그마저 SSOT §10 위반으로 폐기 대상) — 새로 디자인.
import { type Href, router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Logo } from "@/shared/components/Logo";

import { useOnboardingAnalysis } from "../state/analysis";

export function AnalyzingScreen() {
  const { status, error, reset } = useOnboardingAnalysis();

  useEffect(() => {
    if (status === "done") {
      router.replace("/onboarding/today" as Href);
    } else if (status === "idle") {
      // 이 화면으로 직접 들어온 경우(답변 없이) — 질문 화면으로 되돌린다.
      router.replace("/onboarding");
    }
  }, [status]);

  const onRetry = (): void => {
    reset();
    router.replace("/onboarding");
  };

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-page px-6" edges={["top"]}>
      <Logo height={26} />
      <View className="mt-10 items-center gap-6">
        {status === "error" ? (
          <>
            <Text className="text-center text-lg font-semibold text-[#1d1b20]">
              {error ?? "지금 잠시 분석이 원활하지 않아요."}
            </Text>
            <Pressable
              className="rounded-full bg-brand px-6 py-3 active:opacity-90"
              onPress={onRetry}
            >
              <Text className="text-base font-semibold text-white">다시 답변하기</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color="#024f9f" />
            <View className="items-center gap-2">
              <Text className="text-xl font-bold text-[#1d1b20]">지금 상황을 확인하고 있어요</Text>
              <Text className="text-center text-base leading-6 text-[#7c7c7c]">
                답변해 주신 내용을 바탕으로{"\n"}오늘 가장 먼저 할 일을 찾고 있어요.{"\n"}
                잠시만 기다려 주세요.
              </Text>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
