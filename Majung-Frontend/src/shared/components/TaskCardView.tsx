// "오늘의 과제" 카드 — 순수 프레젠테이션(props-driven). 온보딩 완료 화면과 로드맵 탭이 함께 쓴다
// (2곳 이상이라 shared로 승격). 비즈니스 로직 없음 — 렌더링만.
import { Pressable, Text, View } from "react-native";

import type { TaskCard } from "../types";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-3">
      <Text className="w-16 text-sm font-semibold text-[#7c7c7c]">{label}</Text>
      <Text className="flex-1 text-sm leading-5 text-[#1d1b20]">{value}</Text>
    </View>
  );
}

export function TaskCardView({ task, onAskChat }: { task: TaskCard; onAskChat: () => void }) {
  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text className="text-base font-semibold text-brand">오늘 할 일을 알려드릴게요</Text>
        <Text className="text-2xl font-bold leading-9 text-[#1d1b20]">{task.node_name}</Text>
        {task.priority_reason ? (
          <Text className="text-base leading-6 text-[#494551]">{task.priority_reason}</Text>
        ) : null}
      </View>

      {task.deadline ? (
        <View className="rounded-[16px] bg-[#fff3e0] p-4">
          <Text className="text-sm font-semibold text-[#9a5b00]">⏰ {task.deadline} 안에 하세요.</Text>
        </View>
      ) : null}

      {task.summary_easy ? (
        <Text className="text-base leading-6 text-[#1d1b20]">{task.summary_easy}</Text>
      ) : null}

      <View className="gap-3 rounded-[20px] border border-line bg-white p-5">
        <InfoRow label="어디서" value={task.where} />
        {task.docs.length > 0 ? (
          <InfoRow label="준비물" value={task.docs.join(", ")} />
        ) : (
          <InfoRow label="준비물" value="없음" />
        )}
        <InfoRow label="기간" value={`약 ${task.duration_days}일`} />
        {task.next_step ? <InfoRow label="다음" value={task.next_step} /> : null}
      </View>

      <Pressable
        className="items-center rounded-full bg-brand py-4 active:opacity-90"
        onPress={onAskChat}
      >
        <Text className="text-base font-semibold text-white">이 일 물어보기</Text>
      </Pressable>
    </View>
  );
}
