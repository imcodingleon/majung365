// "오늘의 과제" 카드 — 순수 프레젠테이션(props-driven). 온보딩 완료 화면과 로드맵 탭이 함께 쓴다
// (2곳 이상이라 shared로 승격). 비즈니스 로직 없음 — 렌더링만.
import { Pressable, Text, View } from "react-native";

import type { TaskCard } from "../types";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-3">
      <Text className="w-16 text-caption font-semibold text-ink-header">{label}</Text>
      <Text className="flex-1 text-caption leading-5 text-ink-strong">{value}</Text>
    </View>
  );
}

export function TaskCardView({
  task,
  onAskChat,
  onComplete,
  isCompleting,
}: {
  task: TaskCard;
  onAskChat: () => void;
  /** 완료 버튼 — 없으면 버튼 자체를 숨긴다. */
  onComplete?: () => void;
  isCompleting?: boolean;
}) {
  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text className="text-body-lg font-semibold text-brand">오늘 할 일을 알려드릴게요</Text>
        <Text className="text-2xl font-bold leading-9 text-ink-strong">{task.node_name}</Text>
        {task.priority_reason ? (
          <Text className="text-body-lg leading-6 text-ink-sub">{task.priority_reason}</Text>
        ) : null}
      </View>

      {task.deadline ? (
        <View className="rounded-[16px] bg-sun-100 p-4">
          <Text className="text-caption font-semibold text-chip-ink">⏰ {task.deadline} 안에 하세요.</Text>
        </View>
      ) : null}

      {task.summary_easy ? (
        <Text className="text-body-lg leading-6 text-ink-strong">{task.summary_easy}</Text>
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
        <Text className="text-body-lg font-semibold text-white">AI에게 물어보기</Text>
      </Pressable>

      {onComplete ? (
        <Pressable
          className="items-center rounded-full border border-brand py-4 active:opacity-70 disabled:opacity-50"
          onPress={onComplete}
          disabled={isCompleting}
        >
          <Text className="text-body-lg font-semibold text-brand">
            {isCompleting ? "다음 할 일을 찾는 중..." : "완료"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
