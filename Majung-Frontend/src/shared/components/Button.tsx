// 버튼.
//
// 같은 크기의 버튼이 **열두 가지 모양으로 갈려 있었다.** 모서리가 `rounded-xl`·
// `rounded-2xl`·`rounded-full`로 나뉘고 눌림 효과도 `opacity-70`·`80`·`90` 셋이었다.
//
// 저리터러시 사용자에게 **모양이 다르면 다른 종류의 버튼**이다. "이건 눌러도 되나"를
// 매번 다시 판단하게 만든다.
//
// 세 가지로 끝낸다.
//
//   primary   지금 이 화면에서 할 일. 한 화면에 하나가 원칙이다
//   secondary 할 수 있는 다른 일
//   danger    되돌릴 수 없는 일
//
// **높이는 셋 다 같다.** 중요도는 색으로 말하지 크기로 말하지 않는다 — 작은 버튼은
// 손이 떨리는 사람에게 누르기 어렵다.
import { Pressable, Text } from "react-native";

import { COLORS } from "../theme/colors";

export type ButtonTone = "primary" | "secondary" | "danger";

type Props = {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  /** 화면 낭독기가 읽을 문장. 라벨만으로 무엇이 일어나는지 모를 때 채운다. */
  hint?: string;
  /** 글 앞에 붙는 그림. 글을 읽기 어려운 사람에게 종류를 먼저 알린다. */
  icon?: string;
  /** 바깥 여백. 버튼이 스스로 정하지 않고 놓는 쪽이 정한다. */
  className?: string;
};

export function Button({
  label,
  onPress,
  tone = "primary",
  disabled,
  hint,
  icon,
  className,
}: Props) {
  const filled = tone === "primary";
  const danger = tone === "danger";

  const bg = disabled
    ? COLORS.brandMuted
    : filled
      ? COLORS.brand
      : danger
        ? COLORS.alertSoft
        : COLORS.surface;
  const line = disabled
    ? COLORS.brandMuted
    : filled
      ? COLORS.brand
      : danger
        ? COLORS.alertLine
        : COLORS.lineStrong;
  const ink = filled ? COLORS.surface : danger ? COLORS.alert : COLORS.inkStrong;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      accessibilityLabel={hint ?? label}
      className={`items-center justify-center rounded-2xl border-[1.5px] px-4 py-4 active:opacity-80 ${className ?? ""}`}
      style={{ backgroundColor: bg, borderColor: line }}
    >
      <Text className="text-body-lg font-extrabold" style={{ color: ink }}>
        {icon ? `${icon} ` : ""}
        {label}
      </Text>
    </Pressable>
  );
}
