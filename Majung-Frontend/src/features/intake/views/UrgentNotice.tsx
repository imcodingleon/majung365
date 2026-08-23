// 급한 답을 골랐을 때 즉시 나가는 안내 (§3.9-⑩ · §5.3).
//
// 화면을 덮는다. 문항 아래에 펼치면 스크롤 밖에 있을 수 있고, 급한 사람이 놓친다.
//
// **확인 절차를 두지 않는다.** 번호를 누르는 순간이 곧 거는 순간이다. 도움 연결 화면과
// 같은 방식이며, 급한 사람에게 한 단계를 더 요구하지 않는다는 §5.3의 원칙 때문이다.
import { Linking, Pressable, ScrollView, Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";

import type { UrgentNotice as Notice } from "../domain/urgent";
import { FramedModal } from "@/shared/components/FramedModal";

type Props = {
  notice: Notice | null;
  onClose: () => void;
};

export function UrgentNotice({ notice, onClose }: Props) {
  if (!notice) return null;

  const call = () => {
    // 전화 앱이 없는 기기(웹 미리보기 등)에서는 조용히 넘어간다. 안내는 화면에 그대로 남는다.
    Linking.openURL(`tel:${notice.dial}`).catch(() => undefined);
  };

  return (
    <FramedModal visible animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/50 px-6">
        <View
          className="w-full overflow-hidden rounded-3xl bg-white"
          style={{ borderWidth: 2, borderColor: COLORS.alert }}
        >
          <View className="px-5 py-4" style={{ backgroundColor: COLORS.alertSoft }}>
            <Text className="text-title font-extrabold" style={{ color: COLORS.alert }}>
              {notice.title}
            </Text>
          </View>

          <ScrollView className="max-h-64" contentContainerClassName="px-5 py-4">
            {notice.lines.map((line) => (
              <Text key={line} className="mb-2 text-body-lg text-ink-strong">
                {line}
              </Text>
            ))}
          </ScrollView>

          <View className="px-5 pb-5">
            <Pressable
              onPress={call}
              accessibilityRole="button"
              accessibilityLabel={notice.callLabel}
              className="flex-row items-center justify-center gap-2 rounded-2xl py-4 active:opacity-90"
              style={{ backgroundColor: COLORS.alert }}
            >
              <Text className="text-2xl">📞</Text>
              <Text className="text-heading font-extrabold text-white">{notice.callLabel}</Text>
            </Pressable>

            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="안내를 닫고 계속 답하기"
              className="mt-3 items-center rounded-2xl border-[1.5px] border-line py-4 active:opacity-80"
            >
              <Text className="text-body-lg font-bold text-ink-sub">계속 답할게요</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </FramedModal>
  );
}
