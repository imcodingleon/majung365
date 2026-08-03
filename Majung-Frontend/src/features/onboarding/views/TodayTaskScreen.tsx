// 오늘의 과제 화면 — 분석 결과(C6+C7) 과제 1개만 보여준다(SSOT §6.3 "한 번에 하나만").
// 완료 시 로컬에 저장(=완료 플래그 겸용) — 로드맵 탭이 이 결과를 이어서 보여준다.
// Figma에 정식 목업 없음(화이트보드 스케치만 존재) — 새로 디자인.
import { router } from "expo-router";
import { useEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Logo } from "@/shared/components/Logo";
import { TaskCardView } from "@/shared/components/TaskCardView";
import { saveOnboardingResult } from "@/shared/utils/storage";

import { useOnboardingAnalysis } from "../state/analysis";

export function TodayTaskScreen() {
  const { status, task } = useOnboardingAnalysis();

  useEffect(() => {
    // 이 화면으로 직접 들어와 결과가 없는 경우 — 질문 화면으로 되돌린다.
    if (status !== "done" || !task) {
      router.replace("/onboarding");
      return;
    }
    saveOnboardingResult(task);
  }, [status, task]);

  if (!task) return null;

  const onAskChat = (): void => {
    router.push({
      pathname: "/chat",
      params: { q: `${task.node_name}, 지금 어떻게 하면 되나요?` },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top"]}>
      <View className="flex-row items-center gap-3 border-b border-line bg-white px-5 py-4">
        <Logo height={26} />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-6 pt-6">
        <View className="w-full gap-6 lg:max-w-[640px] lg:self-center lg:py-6">
          <TaskCardView task={task} onAskChat={onAskChat} />

          <Text
            className="text-center text-sm font-medium text-[#7c7c7c] underline"
            onPress={() => router.replace("/roadmap")}
          >
            나중에 다시 볼게요 — 홈으로
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
