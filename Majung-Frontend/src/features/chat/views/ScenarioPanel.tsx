// 데스크톱 챗 좌측 시나리오 패널 (majung365_ai.html 시안) — 순수 뷰, props-driven.
// 카드 클릭 = 프리셋 칩과 동일하게 onPick(prompt) 직접 전송(상태 리프팅 없음).
import { Pressable, ScrollView, Text, View } from "react-native";

import { SCENARIOS } from "../domain/scenarios";

function TagPill({ label }: { label: string }) {
  const urgent = label === "긴급";
  return (
    <View className={`rounded-lg px-2 py-0.5 ${urgent ? "bg-sun-100" : "bg-navy-100"}`}>
      <Text className={`text-[10px] font-medium ${urgent ? "text-sun-900" : "text-navy-800"}`}>
        {label}
      </Text>
    </View>
  );
}

export function ScenarioPanel({
  onPick,
  disabled,
}: {
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  let lastGroup = "";
  return (
    <View className="w-[300px] border-r border-paper-border bg-white">
      <View className="border-b border-paper-border px-5 py-4">
        <Text className="text-[15px] font-semibold text-navy-800">상황 시나리오</Text>
        <Text className="pt-0.5 text-xs text-paper-600">
          상황을 선택하거나 직접 입력하세요
        </Text>
      </View>
      <ScrollView contentContainerClassName="gap-1 p-3">
        {SCENARIOS.map((s) => {
          const showLabel = s.group !== lastGroup;
          lastGroup = s.group;
          return (
            <View key={s.id}>
              {showLabel ? (
                <Text className="px-2 pb-1 pt-2 text-[11px] font-semibold tracking-widest text-paper-300">
                  {s.group}
                </Text>
              ) : null}
              <Pressable
                className={`gap-1 rounded-[10px] px-3 py-2.5 active:bg-navy-100 ${
                  disabled ? "opacity-50" : ""
                }`}
                onPress={() => onPick(s.prompt)}
                disabled={disabled}
              >
                <Text className="text-[13px] font-medium text-navy-800">{s.name}</Text>
                <Text className="text-[11px] leading-4 text-paper-600">{s.desc}</Text>
                <View className="flex-row gap-1 pt-1">
                  {s.tags.map((t) => (
                    <TagPill key={t} label={t} />
                  ))}
                </View>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      <View className="border-t border-paper-border bg-paper-50 px-4 py-3">
        <Text className="text-[11px] leading-4 text-paper-300">
          💡 시나리오를 누르면 해당 상황으로 바로 상담이 시작돼요. 직접 입력해도 됩니다.
        </Text>
      </View>
    </View>
  );
}
