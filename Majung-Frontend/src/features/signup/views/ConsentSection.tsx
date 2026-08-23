// 동의 영역 (§3.4). 가입 화면 하단, 시작하기 버튼 바로 위에 놓인다.
import { Pressable, Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";

import {
  type ConsentId,
  type ConsentState,
  type CrimeCategoryId,
  visibleConsents,
} from "../domain/signup";

type Props = {
  crime: CrimeCategoryId | null;
  state: ConsentState;
  onToggle: (id: ConsentId) => void;
  onToggleAll: (next: boolean) => void;
  onOpenDetail: (id: ConsentId) => void;
};

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <View
      className="size-6 items-center justify-center rounded-md border-2"
      style={{
        backgroundColor: checked ? COLORS.brand : COLORS.surface,
        borderColor: checked ? COLORS.brand : COLORS.brandMuted,
      }}
    >
      {checked ? <Text className="text-sm font-extrabold text-white">✓</Text> : null}
    </View>
  );
}

export function ConsentSection({ crime, state, onToggle, onToggleAll, onOpenDetail }: Props) {
  const items = visibleConsents(crime);
  // "모두 동의합니다"를 눌러도 각 항목이 개별로 체크된 상태가 그대로 보여야 한다 (§3.4-5).
  const allChecked = items.every((c) => state[c.id]);

  return (
    <View className="rounded-2xl border-[1.5px] border-brand-soft bg-white p-4">
      {items.map((item) => (
        // 동의 문구가 한 줄에 최대한 넓게 놓이도록 "보러가기"를 아래로 내렸다.
        // 옆에 두면 글줄이 좁아져 세 줄로 접힌다.
        <View key={item.id} className="mb-4">
          <Pressable
            onPress={() => onToggle(item.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: state[item.id] }}
            accessibilityLabel={item.label}
            className="flex-row items-start gap-3 active:opacity-70"
          >
            <View className="mt-0.5">
              <CheckBox checked={state[item.id]} />
            </View>
            <Text className="flex-1 text-base leading-[26px] text-ink-strong">
              <Text
                className="font-extrabold"
                style={{ color: item.required ? COLORS.brand : COLORS.inkSub }}
              >
                {item.required ? "[꼭 필요해요] " : "[안 골라도 돼요] "}
              </Text>
              {item.label}
            </Text>
          </Pressable>

          {item.limitNote ? (
            <Text className="ml-9 mt-1.5 text-[13px] leading-[21px] text-ink-muted">
              {item.limitNote}
            </Text>
          ) : null}

          <Pressable
            onPress={() => onOpenDetail(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`${item.label} 자세히 보기`}
            className="ml-9 mt-2 self-start rounded-lg border border-line px-3 py-2 active:opacity-70"
          >
            <Text className="text-sm font-bold text-ink-sub">무슨 내용인지 보기</Text>
          </Pressable>
        </View>
      ))}

      <Pressable
        onPress={() => onToggleAll(!allChecked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: allChecked }}
        accessibilityLabel="모두 동의해요"
        className="mt-1 flex-row items-center justify-center gap-3 rounded-xl border-[1.5px] border-line bg-page py-3.5 active:opacity-80"
      >
        <CheckBox checked={allChecked} />
        <Text className="text-[15px] font-extrabold text-ink-strong">모두 동의해요</Text>
      </Pressable>
    </View>
  );
}
