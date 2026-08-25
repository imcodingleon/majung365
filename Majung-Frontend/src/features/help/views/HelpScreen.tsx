// 도움 연결 화면 (§5.3).
// 급한 사람에게 한 단계를 더 요구하지 않는다. 번호를 누르면 확인 절차 없이 바로 전화 앱이 열린다.
import { useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { NoteBox, NoteLine } from "@/shared/components/NoteBox";
import { COLORS } from "@/shared/theme/colors";

import { COUNSEL_LINES, EMERGENCY_LINES, type HelpLine } from "../domain/contacts";
import { Icon } from "@/shared/components/Icon";

type Props = {
  onClose: () => void;
};

function LineButton({
  line,
  tone,
  onFail,
}: {
  line: HelpLine;
  tone: "counsel" | "emergency";
  onFail: (label: string) => void;
}) {
  const emergency = tone === "emergency";
  // 확인 모달을 두지 않는다. 누르는 순간이 곧 거는 순간이다.
  const call = () => {
    Linking.openURL(`tel:${line.dial}`).catch(() => onFail(line.label));
  };

  return (
    <Pressable
      onPress={call}
      accessibilityRole="button"
      accessibilityLabel={`${line.label}에 전화하기. ${line.when}. ${line.org}`}
      className="mb-3 flex-row items-center rounded-2xl border-[1.5px] px-4 py-4 active:opacity-90"
      style={{
        backgroundColor: emergency ? COLORS.alertSoft : COLORS.surface,
        borderColor: emergency ? COLORS.alertLine : COLORS.brandSoft,
      }}
    >
      {/* 번호 줄에 맞춰 위쪽에 둔다. 가운데로 두면 큰 번호와 어긋나 보인다 */}
      <View className="mr-3 mt-1 self-start">
        <Icon name="phone" size={26} color={emergency ? COLORS.alert : COLORS.brand} />
      </View>
      <View className="flex-1">
        <Text
          className="text-title font-extrabold"
          style={{ color: emergency ? COLORS.alert : COLORS.brand }}
        >
          {line.label}
        </Text>
        <Text className="mt-1 text-body-lg text-ink-body">{line.when}</Text>
        <Text className="mt-1 text-caption text-ink-muted">{line.org}</Text>
      </View>
    </Pressable>
  );
}

export function HelpScreen({ onClose }: Props) {
  // 전화 앱이 없는 기기에서 아무 일도 일어나지 않으면 사용자는 서비스가 고장 났다고 여긴다.
  const [failedLabel, setFailedLabel] = useState<string | null>(null);

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
      <ScreenHeader title="도움 연결" closeHint="도움 연결 화면 닫기" onClose={onClose} />

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10 pt-6">
        <Text className="text-title font-extrabold text-ink-strong">
          지금 도움이 필요하신가요?
        </Text>
        <Text className="mb-6 mt-2 text-body-lg text-ink-sub">
          어떤 상황인지 정리해서 말하지 않아도 괜찮아요.
        </Text>

        {COUNSEL_LINES.map((line) => (
          <LineButton key={line.dial} line={line} tone="counsel" onFail={setFailedLabel} />
        ))}

        <View className="mt-4 rounded-xl bg-white px-4 py-4">
          <Text className="text-caption text-ink-sub">
            번호를 누르면 전화 앱이 열려요.
          </Text>
          <Text className="mt-1 text-caption text-ink-sub">
            통화 내용은 이 화면에 남지 않아요.
          </Text>
        </View>

        {/* 상담과 긴급신고는 성격이 다르므로 영역을 나눈다 */}
        <View className="mt-8 border-t border-line pt-6">
          <Text className="mb-3 text-heading font-extrabold text-alert">
            생명이 위급하거나 큰 사고라면
          </Text>
          {EMERGENCY_LINES.map((line) => (
            <LineButton key={line.dial} line={line} tone="emergency" onFail={setFailedLabel} />
          ))}
        </View>

        {failedLabel ? (
          <NoteBox tone="warn" className="mt-6">
            <NoteLine tone="warn">이 기기에서는 전화 앱이 열리지 않았어요.{"\n"}
              다른 전화기로 {failedLabel}번을 눌러 주세요.</NoteLine>
          </NoteBox>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
