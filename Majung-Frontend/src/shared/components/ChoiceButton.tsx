// 골라서 누르는 선택지.
//
// 가입의 죄목, 내 정보의 죄목 고치기, 문항의 답, 방문 알림의 시간대가 **거의 같은 코드를
// 각자 들고 있었다.** 고른 것을 나타내는 방식이 조금씩 달라서, 사용자는 화면마다 "지금
// 골라진 게 맞나"를 다시 확인해야 했다.
//
// **고른 것을 색만으로 나타내지 않는다.** 색으로만 구별하면 색을 구별하기 어려운 사람이
// 무엇을 골랐는지 알 수 없다. 동그라미 표시를 함께 낸다.
import { Pressable, Text, View } from "react-native";
import { Icon } from "./Icon";

import { COLORS } from "../theme/colors";
import { FONTS } from "../theme/fonts";

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /**
   * 처리가 다른 답. 이 답 하나만 다른 길로 간다(응급 안내 등).
   * 목록에서 떼어 놓는 것은 놓는 쪽이 하고, 여기서는 색만 바꾼다.
   */
  urgent?: boolean;
  /** 여럿 고를 수 있는 자리인지. 화면 낭독기가 읽는 역할이 달라진다. */
  multi?: boolean;
  /** 고른 표시를 낼지. 답이 하나뿐이라 표시가 군더더기인 자리도 있다. */
  showMark?: boolean;
  className?: string;
};

export function ChoiceButton({
  label,
  selected,
  onPress,
  urgent,
  multi,
  showMark = true,
  className,
}: Props) {
  const accent = urgent ? COLORS.alert : COLORS.brand;
  const bg = selected ? (urgent ? COLORS.alertSoft : COLORS.brandTint) : COLORS.surface;
  const line = selected ? accent : urgent ? COLORS.alertLine : COLORS.line;
  // **고른 것을 글자로 나타내지 않는다** (2026-08-31 시안). 전에는 고르면 글자가
  // 파랗게 바뀌고 굵어졌는데, 시안은 배경·테두리·동그라미 셋으로만 나타내고 글자는
  // 그대로 둔다. 목록을 훑을 때 글자 굵기가 들쭉날쭉하지 않아 읽기 쉽다.
  const ink = urgent ? COLORS.alert : COLORS.inkStrong;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={multi ? { checked: selected } : { selected }}
      accessibilityLabel={label}
      className={`flex-row items-center gap-3 rounded-2xl border-[1.5px] px-4 py-4 active:opacity-80 ${className ?? ""}`}
      style={{ backgroundColor: bg, borderColor: line }}
    >
      {showMark ? (
        <View
          className="size-6 items-center justify-center rounded-full border-2"
          style={{
            backgroundColor: selected ? accent : "transparent",
            borderColor: selected ? accent : COLORS.lineStrong,
          }}
        >
          {/* 동그라미와 같은 24 격자를 쓴다. 작게 그리면 원 안에서 떠 보인다 */}
          {selected ? <Icon name="check" size={24} color={COLORS.surface} /> : null}
        </View>
      ) : null}

      <Text
        className="flex-1 text-heading"
        style={{ color: ink, fontFamily: urgent ? FONTS.extrabold : FONTS.semibold }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
