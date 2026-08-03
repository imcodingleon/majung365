// 로드맵 탭 — 온보딩이 계산한 "오늘의 과제" 1개를 보여준다(CAP-4 재정의).
// 결과는 로컬 저장소(기기당)에서 읽는다 — 탭은 리마운트되지 않으므로 포커스 시마다 다시 읽는다.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Logo } from "@/shared/components/Logo";
import { TaskCardView } from "@/shared/components/TaskCardView";
import type { NodeAnswerInput, TaskCard } from "@/shared/types";
import { ApiError, postAnalyze } from "@/shared/utils/api";
import { clearOnboardingResult, getOnboardingResult, saveOnboardingResult } from "@/shared/utils/storage";

const GENERIC_ERROR = "지금 잠시 연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.";

function EmptyState() {
  return (
    <View className="items-center gap-4 rounded-[20px] border border-line bg-white p-8">
      <Text className="text-center text-lg font-bold text-[#1d1b20]">
        아직 오늘의 과제가 없어요
      </Text>
      <Text className="text-center text-base leading-6 text-[#7c7c7c]">
        몇 가지만 알려주시면{"\n"}지금 가장 먼저 할 일을 찾아드릴게요.
      </Text>
      <Text
        className="rounded-full bg-brand px-6 py-3 text-base font-semibold text-white"
        onPress={() => router.push("/onboarding")}
      >
        지금 체크하기
      </Text>
    </View>
  );
}

export function RoadmapScreen() {
  const [task, setTask] = useState<TaskCard | null>(null);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setTask(getOnboardingResult());
    }, []),
  );

  const onAskChat = (): void => {
    if (!task) return;
    router.push({
      pathname: "/chat",
      params: { q: `${task.node_name}, 지금 어떻게 하면 되나요?` },
    });
  };

  const onComplete = (): void => {
    if (!task || completing) return;
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
        setTask(next);
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : GENERIC_ERROR))
      .finally(() => setCompleting(false));
  };

  const onRecheck = (): void => {
    clearOnboardingResult();
    router.push("/onboarding");
  };

  return (
    <SafeAreaView className="flex-1 overflow-hidden bg-page" edges={["top"]}>
      {/* 모바일 헤더 — 데스크톱에선 셸 navbar가 대체 */}
      <View className="border-b border-line bg-white px-5 py-4 lg:hidden">
        <Logo height={26} />
      </View>
      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10 pt-5">
        <View className="w-full gap-6 lg:max-w-[640px] lg:self-center lg:px-4 lg:py-4">
          {task ? (
            <>
              <TaskCardView
                task={task}
                onAskChat={onAskChat}
                onComplete={onComplete}
                isCompleting={completing}
              />
              {error ? (
                <Text className="text-center text-sm text-[#c0392b]">{error}</Text>
              ) : null}

              {/* 실수로 누르지 않도록 완료 버튼과 확실히 떨어뜨려 맨 아래에 둔다 */}
              <View className="mt-10 items-center">
                <Text
                  className="text-sm font-medium text-[#a3a3a3] underline"
                  onPress={onRecheck}
                >
                  상황이 바뀌었나요? 다시 체크하기
                </Text>
              </View>
            </>
          ) : (
            <EmptyState />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
