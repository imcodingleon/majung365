// 화면 상단 바. 로고가 놓이는 자리다.
//
// **로고가 늘 같은 자리에 있어야 지금 어느 앱을 쓰는지 알 수 있다.** 가입 도중에는 더 그렇다.
// 개인정보를 적어 넣는 화면인데 무슨 앱인지 표시가 없으면 낯설고 불안하다.
//
// 오른쪽 자리는 비워 둘 수 있다. 갈 곳이 없는 화면에 억지로 버튼을 만들지 않는다.
import { Pressable, Text, View } from "react-native";

import { Logo } from "./Logo";

type Props = {
  /** 오른쪽 버튼 문구. 없으면 버튼이 나오지 않는다. */
  actionLabel?: string;
  /** 화면 낭독기가 읽을 문장. 버튼 문구만으로 무엇이 일어나는지 모를 때 채운다. */
  actionHint?: string;
  onAction?: () => void;
};

export function AppHeader({ actionLabel, actionHint, onAction }: Props) {
  return (
    <View className="flex-row items-center border-b border-line bg-white px-5 py-3">
      <View className="flex-1">
        <Logo height={24} />
      </View>

      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionHint ?? actionLabel}
          className="rounded-full bg-sun-500 px-4 py-2.5 active:opacity-90"
        >
          <Text className="text-body font-extrabold text-white">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
