// 내 정보 화면 진입 확인 (§2.5).
//
// 앱 전체에는 잠금을 걸지 않는다. 켜면 바로 홈으로 들어간다. 이 화면에 들어올 때만
// 생일을 한 번 받는다. 본인은 이미 아는 값이라 부담이 없고 기기를 주운 사람은 알 수 없다.
//
// **막다른 길을 하나 열어 둔다.** 가입할 때 생일을 잘못 적었다면 여기를 영영 못 지나고,
// 그 화면이 바로 잘못 적은 값을 고치거나 지우는 유일한 자리다. 갇힌 사람에게는 다시
// 시작하는 길밖에 없다.
//
// 이것이 관문을 뚫는 것은 아니다. **지우는 것은 보는 것이 아니다** — 정보가 새어 나가지
// 않고, 기기를 주운 사람이 얻는 것도 없다.
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NoteBox } from "@/shared/components/NoteBox";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { COLORS } from "@/shared/theme/colors";

import { birthMatches } from "../domain/account";

import { EraseCard } from "./EraseCard";

type Props = {
  storedBirth: string;
  onPass: () => void;
  onClose: () => void;
  /**
   * 다 지우고 처음부터. **한 번 틀린 뒤에만 길을 낸다.**
   *
   * 잘못 적은 생일을 고칠 자리가 이 관문 너머에만 있어서, 이것이 없으면 갇힌다.
   */
  onEraseAll: () => void;
  /** 내 정보를 불러오지 못했을 때. 조용히 빈 화면으로 두지 않는다. */
  error?: string | null;
};

export function BirthGate({ storedBirth, onPass, onClose, onEraseAll, error }: Props) {
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
  // 높이 62는 시안 값이다. `py`만 주면 글꼴에 따라 칸마다 높이가 흔들린다.
  const box =
    "h-[62px] rounded-xl border-[1.5px] border-line bg-white px-3 text-center text-body-lg text-ink-strong";

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
          생년월일을 입력해주세요
        </Text>
        {/* **무엇에 쓰는지 밝힌다** (2026-08-31 시안). "다른 사람이 보지 못하게"는 막는
            이야기라 잠금으로 읽혔는데, 이 자리는 본인인지 한 번 확인하는 곳이다 */}
        <Text className="mb-8 mt-2 text-body-lg text-ink-sub">
          입력하신 정보는 본인 확인을 위한 용도로만 사용됩니다.
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
          <NoteBox tone="alert" className="mt-4">
            {"입력하신 생년월일이 가입할 때 등록한 정보와 달라요.\n입력한 내용을 다시 한번 확인해주세요.\n\n생년월일이 일치해야 내 정보를 확인할 수 있어요."}
          </NoteBox>
        ) : null}

        <Pressable
          onPress={check}
          disabled={!filled}
          accessibilityRole="button"
          accessibilityState={{ disabled: !filled }}
          accessibilityLabel="확인"
          className="mt-6 items-center justify-center rounded-2xl active:opacity-90"
          style={{ height: 59, backgroundColor: filled ? COLORS.brand : COLORS.brandMuted }}
        >
          <Text className="text-body-lg font-extrabold text-white">확인</Text>
        </Pressable>

        {/* **틀린 뒤에만 낸다.** 처음부터 보이면 지우는 쪽이 쉬운 길처럼 읽힌다.
            2026-08-31 시안이 링크 한 단계를 없앴다 — 틀린 사람에게는 이 카드가 유일한
            길인데, 그것을 밑줄 친 글씨 뒤에 숨겨 두면 갇힌 채로 나가는 사람이 생긴다 */}
        {failed ? (
          <View className="mt-6">
            <EraseCard scope="account" onErase={onEraseAll} onCancel={onClose} />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
