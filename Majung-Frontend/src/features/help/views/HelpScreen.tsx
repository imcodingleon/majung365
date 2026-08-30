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
      {/* 수화기가 **연한 원 위에 얹힌다** (2026-08-31 시안). 원본 SVG에는 원과 수화기가
          한 덩어리로 들어 있는데, 바탕색과 획색이 따로 놀아야 해서 원은 여기서 그린다.
          **번호 줄에 맞춰 위에 둔다.** 시안의 아이콘 자리가 `items-start`이고, 원과
          번호 줄이 둘 다 30px이라 나란히 선다. 카드 세로 가운데로 옮겼다가 되돌렸다 —
          가운데로 두면 아이콘이 설명 줄 옆으로 내려가 번호와 짝이 아닌 것처럼 보인다 */}
      <View
        className="mr-2 size-[30px] items-center justify-center self-start rounded-full"
        style={{ backgroundColor: emergency ? COLORS.alertLine : COLORS.brandSoft }}
      >
        <Icon name="phoneRound" size={30} color={emergency ? COLORS.alert : COLORS.brand} />
      </View>
      <View className="flex-1">
        <Text
          className="text-title font-bold"
          style={{ color: emergency ? COLORS.alert : COLORS.brand }}
        >
          {line.label}
        </Text>
        <Text className="mt-1 text-body-lg font-medium text-ink-hint">{line.when}</Text>
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
      <ScreenHeader title="긴급 연락처" closeHint="긴급 연락처 화면 닫기" onClose={onClose} />

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10 pt-6">
        <Text
          className="text-display font-bold text-ink-strong"
          style={{ letterSpacing: 0.2 }}
        >
          지금 도움이 필요하신가요?
        </Text>
        <Text className="mt-2 text-body-lg text-ink-sub">
          상황에 맞는 기관으로 바로 연결됩니다.
        </Text>

        {/* **번호 목록 위로 올렸다** (2026-08-31 시안). 전화를 걸기 전에 읽어야 하는
            말인데 목록 아래에 있어서, 이미 걸고 난 뒤에야 눈에 들어왔다 */}
        <View className="mb-6 mt-4 rounded-xl px-4 py-4" style={{ backgroundColor: COLORS.line }}>
          <Text className="text-caption text-ink-sub">번호 선택 시 전화 앱으로 연결됩니다.</Text>
          <Text className="mt-1 text-caption text-ink-sub">
            통화 기록은 별도로 저장되지 않습니다.
          </Text>
        </View>

        {/* 구역 제목이 새로 생겼다. 전에는 긴급 쪽에만 있어서 위쪽 목록이 무엇인지 말해
            주는 것이 없었다 */}
        <Text className="mb-3 text-heading font-extrabold text-brand">상담이 필요한 경우</Text>
        {COUNSEL_LINES.map((line) => (
          <LineButton key={line.dial} line={line} tone="counsel" onFail={setFailedLabel} />
        ))}

        {/* 상담과 긴급신고는 성격이 다르므로 영역을 나눈다 */}
        <View className="mt-8 border-t border-line pt-6">
          <Text className="mb-3 text-heading font-extrabold text-alert">
            긴급 신고가 필요한 경우
          </Text>
          {EMERGENCY_LINES.map((line) => (
            <LineButton key={line.dial} line={line} tone="emergency" onFail={setFailedLabel} />
          ))}
        </View>

        {failedLabel ? (
          <NoteBox tone="warn" className="mt-6">
            <NoteLine tone="warn">이 기기에서는 전화 앱이 열리지 않았습니다.{"\n"}
              다른 전화기로 {failedLabel}번을 눌러 주세요.</NoteLine>
          </NoteBox>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
