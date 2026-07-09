// 온보딩 - 상황 체크 (CAP-1a). Figma 2:726. 선택지 탭만으로 완주 가능.
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { OnboardingOption } from "../domain/questions";
import { useOnboarding } from "../hooks/useOnboarding";

function ProgressSection({ step, total }: { step: number; total: number }) {
  const pct = Math.round(((step + 1) / total) * 100);
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-brand">현재 진행 단계</Text>
        <Text className="text-base font-semibold text-[#7c7c7c]">
          {step + 1} / {total}
        </Text>
      </View>
      <View className="h-2 w-full overflow-hidden rounded-full bg-line">
        <View className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}

function OptionButton({
  option,
  selected,
  onPress,
}: {
  option: OnboardingOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      className={`flex-row items-center justify-between rounded-[20px] p-5 active:opacity-90 ${
        selected ? "border-[3px] border-brand bg-brand-soft" : "border border-[#d3d3d3] bg-white"
      }`}
      onPress={onPress}
    >
      <View className="flex-1 gap-1">
        <Text
          className={`text-lg ${selected ? "font-semibold text-[#1d1b20]" : "font-medium text-[#1d1b20]"}`}
        >
          {option.label}
        </Text>
        {option.hint ? <Text className="text-sm text-[#494551]">{option.hint}</Text> : null}
      </View>
      {selected ? (
        <View className="size-6 items-center justify-center rounded-full bg-brand">
          <Text className="text-xs font-bold text-white">✓</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function OnboardingScreen() {
  const { step, total, question, selectedOptionId, canProceed, isLast, select, goNext } =
    useOnboarding();

  const onProceed = (): void => {
    if (!goNext()) {
      // 마지막 단계 완료 → 데모 메인(상담)으로. (답변→triage 연동은 후속)
      router.replace("/chat");
    }
  };

  return (
    <SafeAreaView className="flex-1 overflow-hidden bg-page" edges={["top"]}>
      {/* 모바일 헤더 — 데스크톱에선 중앙 정렬 콘텐츠만(셸 밖 라우트) */}
      <View className="border-b border-line bg-white px-5 py-4 lg:hidden">
        <Text className="text-xl text-ink-header">마중365</Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-6 pt-5">
        <View className="w-full gap-8 lg:max-w-[640px] lg:self-center lg:py-6">
          <ProgressSection step={step} total={total} />

          <Text className="text-2xl font-bold leading-9 text-[#1d1b20]">{question.title}</Text>

          <View className="gap-4">
            {question.options.map((opt) => (
              <OptionButton
                key={opt.id}
                option={opt}
                selected={selectedOptionId === opt.id}
                onPress={() => select(opt.id)}
              />
            ))}
          </View>

          <View className="flex-row items-start gap-3 rounded-[20px] bg-line p-4">
            <Text className="text-base">ℹ️</Text>
            <Text className="flex-1 text-sm leading-5 text-[#7c7c7c]">
              작성해주시는 모든 정보는 맞춤형 지원 정보를 제공하기 위해서만 사용되며, 철저히 보호됩니다.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View className="border-t border-line bg-page px-4 pb-3 pt-3">
        <View className="w-full lg:max-w-[640px] lg:self-center">
          <Pressable
            className={`items-center rounded-full py-4 active:opacity-90 ${
              canProceed ? "bg-brand" : "bg-[#b4c7de]"
            }`}
            onPress={onProceed}
            disabled={!canProceed}
          >
            <Text className="text-base font-semibold text-white">{isLast ? "완료" : "다음"}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
