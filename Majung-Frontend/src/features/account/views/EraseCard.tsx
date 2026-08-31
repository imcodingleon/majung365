// 지우기 전에 한 번 더 묻는 카드 (§9.4 · 2026-08-31 시안).
//
// **생일 확인 화면과 내 정보 화면이 같은 카드를 쓴다.** 두 벌로 두면 한쪽만 고치게 되고,
// 되돌릴 수 없는 일을 알리는 문구가 화면마다 다르면 어느 쪽이 정확한지 알 수 없다.
import { Pressable, Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";
import { FONTS } from "@/shared/theme/fonts";

import {
  eraseConfirmLabel,
  eraseDetail,
  eraseLead,
  eraseTitle,
  eraseWarning,
  type EraseScope,
} from "../domain/account";

export function EraseCard({
  scope,
  onErase,
  onCancel,
}: {
  scope: EraseScope;
  onErase: () => void;
  onCancel: () => void;
}) {
  const lead = eraseLead(scope);
  const warning = eraseWarning(scope);

  return (
    <View
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: COLORS.alertLine }}
    >
      <Text
        style={{ fontSize: 17, lineHeight: 27, fontFamily: FONTS.extrabold, color: COLORS.alertInk }}
      >
        {eraseTitle(scope)}
      </Text>

      {lead ? (
        <Text className="mt-2 text-body text-ink-body" style={{ lineHeight: 25 }}>
          {lead}
        </Text>
      ) : null}

      <View className="mt-3">
        {eraseDetail(scope).map((line) => (
          <Text key={line} className="mb-1 text-body text-ink-body" style={{ lineHeight: 25 }}>
            · {line}
          </Text>
        ))}
      </View>

      {/* **목록에서 한 줄 띄운다** (시안). 되돌릴 수 없다는 말이 지워지는 항목들과 같은
          층에 있으면 그것도 항목 하나로 읽힌다 */}
      {warning ? (
        <Text className="mt-4 text-body text-ink-body" style={{ lineHeight: 25 }}>
          {warning}
        </Text>
      ) : null}

      <View className="mt-4 flex-row gap-2">
        <Pressable
          onPress={onErase}
          accessibilityRole="button"
          accessibilityLabel={eraseConfirmLabel(scope)}
          className="rounded-xl px-4 py-3 active:opacity-90"
          style={{ backgroundColor: COLORS.alert }}
        >
          <Text className="text-body font-extrabold text-white">{eraseConfirmLabel(scope)}</Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="취소하기"
          className="rounded-xl border bg-white px-4 py-3 active:opacity-90"
          style={{ borderColor: COLORS.line }}
        >
          <Text className="text-body font-semibold text-ink-sub">취소하기</Text>
        </Pressable>
      </View>
    </View>
  );
}
