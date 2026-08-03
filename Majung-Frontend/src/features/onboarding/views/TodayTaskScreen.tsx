// 오늘의 과제 화면 — 분석 결과(C6+C7) 과제 1개만 보여준다(SSOT §6.3 "한 번에 하나만").
// 완료 시 로컬에 저장(=완료 플래그 겸용) — 로드맵 탭이 이 결과를 이어서 보여준다.
// Figma에 정식 목업 없음(화이트보드 스케치만 존재) — 새로 디자인.
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Logo } from "@/shared/components/Logo";
import { TaskCardView } from "@/shared/components/TaskCardView";
import type { NodeAnswerInput } from "@/shared/types";
import { ApiError, postAnalyze } from "@/shared/utils/api";
import { saveOnboardingResult } from "@/shared/utils/storage";

import { useOnboardingAnalysis } from "../state/analysis";

const GENERIC_ERROR = "지금 잠시 연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.";

export function TodayTaskScreen() {
  const { status, task } = useOnboardingAnalysis();
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const onComplete = (): void => {
    if (completing) return;
    setError(null);
    setCompleting(true);
    const nextStates = { ...task.resolved_states, [task.node_id]: "O" as const };
    const answers: NodeAnswerInput[] = Object.entries(nextStates).map(([node_id, state]) => ({
      node_id,
      state,
    }));
    postAnalyze({ answers })
      .then((next) => {
        saveOnboardingResult(next);
        router.replace("/roadmap");
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : GENERIC_ERROR);
        setCompleting(false);
      });
  };

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top"]}>
      <View className="flex-row items-center gap-3 border-b border-line bg-white px-5 py-4">
        <Logo height={26} />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-6 pt-6">
        <View className="w-full gap-6 lg:max-w-[640px] lg:self-center lg:py-6">
          <TaskCardView
            task={task}
            onAskChat={onAskChat}
            onComplete={onComplete}
            isCompleting={completing}
          />
          {error ? <Text className="text-center text-sm text-[#c0392b]">{error}</Text> : null}

          <View className="mt-10 items-center">
            <Text
              className="text-sm font-medium text-[#a3a3a3] underline"
              onPress={() => router.replace("/roadmap")}
            >
              나중에 다시 볼게요 — 홈으로
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
