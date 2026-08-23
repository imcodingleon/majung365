// 온보딩 - 상황 체크 (CAP-1a). Figma 2:726 기반, 그래프 코어 노드로 재설계.
// 문항(O/X/△ 버튼) 전체 + 마지막 자유서술 단계 1개로 완주. 완료하면 분석을 시작하고 로딩 화면으로 이동.
import { type Href, router } from "expo-router";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Logo } from "@/shared/components/Logo";

import type { OnboardingOption } from "../domain/questions";
import { useOnboarding } from "../hooks/useOnboarding";
import { useOnboardingAnalysis } from "../state/analysis";

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
  const {
    step,
    total,
    question,
    isNarrativeStep,
    selectedOptionId,
    narrative,
    setNarrative,
    canProceed,
    isLast,
    select,
    goNext,
    goPrev,
    toAnswers,
    toNarrative,
  } = useOnboarding();
  const { start } = useOnboardingAnalysis();

  const onProceed = (): void => {
    if (!goNext()) {
      // 자유서술 단계까지 완료 → 분석 시작(백엔드 C6+C7) + 로딩 화면으로 이동
      start(toAnswers(), toNarrative());
      router.replace("/onboarding/analyzing" as Href);
    }
  };

  const onBack = (): void => {
    // 단계가 남아있으면 이전 단계로, 첫 단계면 온보딩을 빠져나간다.
    if (goPrev()) return;
    if (router.canGoBack()) router.back();
    else router.replace("/chat");
  };

  return (
    <SafeAreaView className="flex-1 overflow-hidden bg-page" edges={["top"]}>
      {/* 헤더 — 온보딩은 탭 셸 밖 라우트라 데스크톱에도 navbar/탭바가 없다.
          되돌아갈 길을 위해 뒤로가기 버튼을 전 화면폭에서 노출한다. */}
      <View className="flex-row items-center gap-3 border-b border-line bg-white px-5 py-4">
        <Pressable
          onPress={onBack}
          hitSlop={10}
          className="size-9 items-center justify-center rounded-full active:bg-line"
          accessibilityLabel="뒤로 가기"
        >
          <Text className="text-2xl leading-none text-ink-header">←</Text>
        </Pressable>
        <Logo height={26} />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-6 pt-5">
        <View className="w-full gap-8 lg:max-w-[640px] lg:self-center lg:py-6">
          <ProgressSection step={step} total={total} />

          {isNarrativeStep ? (
            <>
              <View className="gap-2">
                <Text className="text-2xl font-bold leading-9 text-[#1d1b20]">
                  그 밖에 하고 싶은 말이 있다면{"\n"}자유롭게 적어주세요
                </Text>
                <Text className="text-sm text-[#7c7c7c]">
                  선택 항목이에요. 비워 두고 완료하셔도 돼요.
                </Text>
              </View>
              <TextInput
                className="min-h-[160px] rounded-[20px] border border-[#d3d3d3] bg-white p-5 text-base leading-6 text-[#1d1b20]"
                placeholder="예) 신분증은 있는데 통장은 아직 없어요. 마음이 좀 힘들어요."
                placeholderTextColor="#9c9c9c"
                value={narrative}
                onChangeText={setNarrative}
                multiline
                textAlignVertical="top"
              />
            </>
          ) : question ? (
            <>
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
            </>
          ) : null}

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
