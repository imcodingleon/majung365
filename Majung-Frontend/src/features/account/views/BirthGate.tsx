// 내 정보 화면 진입 확인 (§2.5).
//
// 앱 전체에는 잠금을 걸지 않는다. 켜면 바로 홈으로 들어간다. 이 화면에 들어올 때만
// 생일을 한 번 받는다. 본인은 이미 아는 값이라 부담이 없고 기기를 주운 사람은 알 수 없다.
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NoteBox } from "@/shared/components/NoteBox";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { COLORS } from "@/shared/theme/colors";

import { birthMatches } from "../domain/account";

type Props = {
  storedBirth: string;
  onPass: () => void;
  onClose: () => void;
  /** 내 정보를 불러오지 못했을 때. 조용히 빈 화면으로 두지 않는다. */
  error?: string | null;
};

export function BirthGate({ storedBirth, onPass, onClose, error }: Props) {
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
    "rounded-xl border-[1.5px] border-line bg-white px-3 py-4 text-center text-body-lg text-ink-strong";

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
      <ScreenHeader title="내 정보" closeHint="내 정보 화면 닫기" onClose={onClose} />

      <View className="flex-1 px-5 pt-6">
        {/* 불러오지 못한 것을 조용히 넘기지 않는다. 빈 화면이면 사용자는 자기 탓을 한다 */}
        {error ? (
          <NoteBox tone="alert" className="mb-6">
            {error}
          </NoteBox>
        ) : null}

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
          <NoteBox tone="alert" className="mt-4">가입할 때 적으신 생일과 달라요. 다시 한번 봐 주세요.</NoteBox>
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
