// 칸을 눌러 목록에서 하나를 고르는 부품 (§3.2 · §3.7 · §7.2).
//
// **생일·출소날짜와 방문 시간이 같은 방식으로 동작해야 한다.** 한 앱 안에서 값을 고르는
// 법이 여러 가지면 배워야 할 것이 그만큼 늘어난다. 그래서 두 화면이 이 부품을 함께 쓴다 —
// 각자 만들어 두면 한쪽만 고쳐지고 나머지가 조용히 남는다.
//
// 칸이 화면에 그대로 보이고, 누르면 그 하나만 고르는 목록이 뜬다. 고르면 바로 닫힌다 —
// 고를 것이 하나뿐인 자리에 확인 버튼을 두면 누를 것이 두 번으로 늘어난다.
//
// **직접 만든다.** 선택기 라이브러리는 웹과 안드로이드·iOS에서 각각 다른 화면을 띄우는데,
// 그러면 저리터러시 사용자가 만나는 화면을 우리가 통제하지 못한다.
import { useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { COLORS } from "../theme/colors";
import { FramedModal } from "./FramedModal";

/** 목록 한 줄 높이. 처음 설 자리를 픽셀로 계산해야 해서 고정한다. */
export const PICKER_ROW = 52;

/** 목록에 서는 한 줄. `label`이 없으면 `value`에 단위를 붙여 그린다. */
export type PickerItem = {
  value: number;
  /** 화면에 보일 말. 시각처럼 숫자만으로 읽히지 않는 값에 쓴다. */
  label?: string;
  /** 고를 수 없는 줄. 주말이나 지난 날짜가 그렇다. */
  disabled?: boolean;
};

export function PickerBox({
  text,
  unit,
  filled,
  onPress,
  accessibilityLabel,
}: {
  text: string;
  unit: string;
  filled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="flex-1 flex-row items-center justify-center gap-1 rounded-xl border-[1.5px] bg-white px-2 py-4 active:opacity-80"
      style={{ borderColor: filled ? COLORS.brand : COLORS.line }}
    >
      <Text
        className="text-body-lg"
        style={{
          color: filled ? COLORS.inkStrong : COLORS.inkMuted,
          fontWeight: filled ? "700" : "500",
        }}
      >
        {text}
      </Text>
      <Text className="text-body" style={{ color: filled ? COLORS.inkSub : COLORS.inkMuted }}>
        {unit}
      </Text>
    </Pressable>
  );
}

export function PickerSheet({
  visible,
  title,
  items,
  current,
  unit,
  restIndex = 0,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** "월을 고르세요"처럼 무엇을 고르는지 밝힌다. */
  title: string;
  items: readonly PickerItem[];
  /** 지금 골라져 있는 값. 없으면 null. */
  current: number | null;
  /** 줄 끝에 붙는 말. `label`이 있는 줄에는 붙지 않는다. */
  unit: string;
  /** 고른 값이 없을 때 목록이 설 자리. 생일의 년처럼 흔한 값이 멀리 있을 때 쓴다. */
  restIndex?: number;
  onPick: (value: number) => void;
  onClose: () => void;
}) {
  const listRef = useRef<ScrollView>(null);
  const placed = useRef(false);

  const at = current === null ? restIndex : items.findIndex((x) => x.value === current);
  // 고른 줄이 위에 딱 붙지 않고 한 줄쯤 위가 함께 보이게 둔다. 앞뒤가 보여야 목록으로 읽힌다.
  const offset = Math.max(0, (at < 0 ? restIndex : at) - 1) * PICKER_ROW;

  // 열릴 때마다 자리를 다시 잡는다.
  if (!visible && placed.current) placed.current = false;

  return (
    <FramedModal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* 바깥을 눌러도 닫힌다. 고르지 않고 빠져나올 길이 있어야 한다.
          바깥과 시트를 형제로 둔다 — 겹쳐 두면 버튼 안에 버튼이 들어가 웹에서 깨진다. */}
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0 bg-black/40"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        />
        <View className="rounded-t-3xl bg-white px-5 pb-8 pt-5">
          <View className="mb-4 flex-row items-center">
            <Text className="flex-1 text-heading font-extrabold text-ink-strong">{title}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="닫기"
              className="size-9 items-center justify-center rounded-full active:opacity-70"
            >
              <Text className="text-2xl text-ink-muted">✕</Text>
            </Pressable>
          </View>

          <ScrollView
            className="h-80 rounded-2xl border-[1.5px] border-line bg-page"
            contentContainerClassName="py-2"
            showsVerticalScrollIndicator={false}
            ref={listRef}
            onContentSizeChange={() => {
              if (placed.current) return;
              placed.current = true;
              listRef.current?.scrollTo({ y: offset, animated: false });
            }}
          >
            {items.map((item) => {
              const on = item.value === current;
              const text = item.label ?? `${item.value}${unit}`;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => !item.disabled && onPick(item.value)}
                  disabled={item.disabled}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled: item.disabled }}
                  accessibilityLabel={item.disabled ? `${text}. 고를 수 없어요` : text}
                  className="mx-2 items-center justify-center rounded-xl active:opacity-70"
                  style={{
                    height: PICKER_ROW - 4,
                    marginVertical: 2,
                    backgroundColor: on ? COLORS.brand : "transparent",
                    // **고를 수 없는 줄도 남겨 둔다.** 빼 버리면 목록에서 날짜가 건너뛰어
                    // 보여 무슨 일인지 알 수 없다. 흐리게 두면 "그날은 안 된다"로 읽힌다.
                    opacity: item.disabled ? 0.35 : 1,
                  }}
                >
                  <Text
                    className="text-title"
                    style={{
                      color: on ? COLORS.surface : COLORS.inkStrong,
                      fontWeight: on ? "800" : "600",
                    }}
                  >
                    {text}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </FramedModal>
  );
}
