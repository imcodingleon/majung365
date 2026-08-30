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
import { Pressable, Text, View } from "react-native";

import { COLORS } from "../theme/colors";
import { Icon, type IconName } from "./Icon";

export type ButtonTone = "primary" | "secondary" | "danger";

type Props = {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  /** 화면 낭독기가 읽을 문장. 라벨만으로 무엇이 일어나는지 모를 때 채운다. */
  hint?: string;
  /** 글 앞에 붙는 그림. 글을 읽기 어려운 사람에게 종류를 먼저 알린다. */
  icon?: IconName;
  /**
   * 글자 크기 (2026-08-31 시안).
   *
   * 화면에 하나뿐인 마무리 버튼("시작하기")은 카드 안에 여럿 놓이는 버튼보다 크다.
   * 시안이 그렇게 갈라 놓았고, 그 자리에서만 `lg`를 쓴다.
   */
  size?: "md" | "lg";
  /**
   * 글자와 그림 색 (2026-08-31 시안).
   *
   * **테두리 버튼은 자리마다 색이 다르다.** 할 일 카드에서 방문 예약은 파랑,
   * 끝냈다는 표시는 초록이다 — 하나는 어디로 가는 일이고 하나는 마치는 일이라
   * 성격이 다르다. 톤 셋(`primary`·`secondary`·`danger`)으로는 그 갈래를 낼 수 없어
   * 놓는 쪽이 색을 준다. 주지 않으면 톤이 정하는 기본색을 그대로 쓴다.
   */
  ink?: string;
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
  size = "md",
  ink: inkOverride,
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
  const ink = inkOverride ?? (filled ? COLORS.surface : danger ? COLORS.alert : COLORS.inkStrong);

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
      {/* 그림과 글을 가로로 붙인다. 예전에는 이모지를 글 앞에 이어 붙였는데,
          그러면 기기마다 크기와 색이 달라지고 글자 기준선과도 어긋났다 */}
      <View className="flex-row items-center justify-center gap-2">
        {icon ? <Icon name={icon} size={22} color={ink} /> : null}
        <Text
          className={`font-extrabold ${size === "lg" ? "text-title" : "text-body-lg"}`}
          style={{ color: ink }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
