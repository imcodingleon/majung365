// 로드맵 화면 (CAP-4 표시형 체크리스트). Figma 2:1614 — 네비 정본.
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useRoadmap } from "@/shared/state/roadmap";
import type { RoadmapTask } from "@/shared/types";

function ProgressSection({ total }: { total: number }) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-bold text-brand">오늘의 진행 상황</Text>
        <Text className="text-base font-semibold text-[#7c7c7c]">{total}가지</Text>
      </View>
      {/* 표시형: 완료 체크는 본선. 여정을 보여주는 장식용 진행 표시. */}
      <View className="h-2 w-full overflow-hidden rounded-full bg-line">
        <View className="h-full rounded-full bg-brand" style={{ width: "20%" }} />
      </View>
    </View>
  );
}

function DeadlineBanner({ deadline }: { deadline: string }) {
  return (
    <View className="flex-row items-center gap-4 rounded-[20px] border border-dashed border-[#fa8504] bg-chip p-6">
      <Text className="text-xl">⏰</Text>
      <Text className="flex-1 text-base leading-6 text-chip-ink">
        가장 급한 일은 <Text className="font-bold text-chip-ink">{deadline}</Text> 전에 관할 주민센터를
        방문하시거나 온라인으로 신청하셔야 빠르게 처리돼요.
      </Text>
    </View>
  );
}

function TaskCard({ task }: { task: RoadmapTask }) {
  return (
    <View className="gap-4 rounded-[20px] border border-[#f8f9fc] bg-white p-6 shadow">
      <View className="flex-row items-start justify-between">
        <View className="size-[38px] items-center justify-center rounded-xl bg-brand-soft">
          <Text className="text-lg">{task.icon ?? "📋"}</Text>
        </View>
        {task.urgency === "high" ? (
          <View className="rounded-full bg-[#ffdad6] px-2 py-1">
            <Text className="text-xs font-medium text-[#93000a]">긴급도 높음</Text>
          </View>
        ) : null}
      </View>
      <View className="gap-2">
        <Text className="text-lg font-semibold text-[#1d1b20]">{task.title}</Text>
        <Text className="text-base leading-6 text-[#494551]">{task.description}</Text>
      </View>
      <Pressable
        className="items-center rounded-lg bg-brand-soft py-3 active:opacity-80"
        onPress={() => task.linkUrl && Linking.openURL(task.linkUrl)}
      >
        <Text className="text-sm font-bold text-brand">바로가기</Text>
      </Pressable>
    </View>
  );
}

export function RoadmapScreen() {
  const { tasks } = useRoadmap();
  const deadlineTask = tasks.find((t) => t.urgency === "high" && t.deadline);

  return (
    <SafeAreaView className="flex-1 overflow-hidden bg-page" edges={["top"]}>
      <View className="border-b border-line bg-white px-5 py-4">
        <Text className="text-xl text-ink-header">마중365</Text>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-8 px-5 pb-10 pt-5">
        <ProgressSection total={tasks.length} />

        <View className="gap-2">
          <Text className="text-2xl font-bold leading-9 text-[#1d1b20]">
            오늘 가장 먼저{"\n"}해결해야 할 일들입니다.
          </Text>
          <Text className="text-base leading-6 text-[#7c7c7c]">
            어려운 상황에서도 한 걸음씩 나아갈 수 있도록 핵심 할 일을 정리했습니다.
          </Text>
        </View>

        <View className="gap-4">
          {deadlineTask?.deadline ? <DeadlineBanner deadline={deadlineTask.deadline} /> : null}
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
