// 내 정보 화면 진입 확인 (§2.5).
//
// 앱 전체에는 잠금을 걸지 않는다. 켜면 바로 홈으로 들어간다. 이 화면에 들어올 때만
// 생일을 한 번 받는다. 본인은 이미 아는 값이라 부담이 없고 기기를 주운 사람은 알 수 없다.
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "@/shared/theme/colors";

import { birthMatches } from "../domain/account";

type Props = {
  storedBirth: string;
  onPass: () => void;
  onClose: () => void;
};

export function BirthGate({ storedBirth, onPass, onClose }: Props) {
  const [parts, setParts] = useState({ year: "", month: "", day: "" });
  const [failed, setFailed] = useState(false);

  const check = () => {
    if (birthMatches(storedBirth, parts)) {
      onPass();
      return;
    }
    setFailed(true);
  };

  const filled = parts.year.length === 4 && parts.month !== "" && parts.day !== "";
  const box =
    "rounded-xl border-[1.5px] border-line bg-white px-3 py-3.5 text-center text-body-lg text-ink-strong";

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-end px-5 py-4">
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="닫기"
          className="size-10 items-center justify-center rounded-full active:opacity-70"
        >
          <Text className="text-2xl text-ink-muted">✕</Text>
        </Pressable>
      </View>

      <View className="flex-1 px-5">
        <Text className="text-title font-extrabold text-ink-strong">
          생일을 알려주세요
        </Text>
        <Text className="mb-8 mt-2 text-body-lg text-ink-sub">
          다른 사람이 내 정보를 보지 못하게 한 번만 확인할게요.
        </Text>

        <View className="flex-row items-center gap-2">
          <TextInput
            className={`${box} w-24`}
            value={parts.year}
            onChangeText={(t) => {
              setFailed(false);
              setParts((p) => ({ ...p, year: t.replace(/\D/g, "").slice(0, 4) }));
            }}
            keyboardType="number-pad"
            placeholder="1980"
            placeholderTextColor={COLORS.inkMuted}
            accessibilityLabel="생일 년"
          />
          <Text className="text-body-lg text-ink-sub">년</Text>
          <TextInput
            className={`${box} w-16`}
            value={parts.month}
            onChangeText={(t) => {
              setFailed(false);
              setParts((p) => ({ ...p, month: t.replace(/\D/g, "").slice(0, 2) }));
            }}
            keyboardType="number-pad"
            placeholder="3"
            placeholderTextColor={COLORS.inkMuted}
            accessibilityLabel="생일 월"
          />
          <Text className="text-body-lg text-ink-sub">월</Text>
          <TextInput
            className={`${box} w-16`}
            value={parts.day}
            onChangeText={(t) => {
              setFailed(false);
              setParts((p) => ({ ...p, day: t.replace(/\D/g, "").slice(0, 2) }));
            }}
            keyboardType="number-pad"
            placeholder="15"
            placeholderTextColor={COLORS.inkMuted}
            accessibilityLabel="생일 일"
          />
          <Text className="text-body-lg text-ink-sub">일</Text>
        </View>

        {failed ? (
          <View className="mt-4 rounded-xl border border-alert-line bg-alert-soft px-4 py-3.5">
            <Text className="text-body text-alert-ink">
              가입할 때 적으신 생일과 달라요. 다시 한번 봐 주세요.
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={check}
          disabled={!filled}
          accessibilityRole="button"
          accessibilityState={{ disabled: !filled }}
          accessibilityLabel="확인"
          className="mt-6 items-center rounded-2xl py-4 active:opacity-90"
          style={{ backgroundColor: filled ? COLORS.brand : COLORS.brandMuted }}
        >
          <Text className="text-body-lg font-extrabold text-white">확인</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
