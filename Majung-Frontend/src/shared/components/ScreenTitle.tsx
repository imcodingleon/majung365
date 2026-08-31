// 로고 바 아래에 오는 화면 제목 줄 (2026-08-31 시안).
//
// **알림과 채팅 내역이 같은 모양을 쓴다.** 두 화면이 각자 그리고 있었는데, 한쪽만
// 고치면 나란히 놓았을 때 제목 높이가 어긋난다.
//
// 가운데 정렬인 이유는 시안이 그렇게 정했기 때문이다 — 이 줄에는 제목 말고 아무것도
// 오지 않으므로, 왼쪽에 붙이면 오른쪽이 통째로 빈 자리로 남는다.
import { Text, View } from "react-native";

export function ScreenTitle({ label }: { label: string }) {
  return (
    // 높이를 64로 고정한다. 줄높이에 맡기면 글꼴이 바뀔 때 제목 바 높이가 따라 흔들린다.
    <View className="h-16 items-center justify-center border-b border-line bg-white px-3">
      <Text
        className="text-title font-bold text-ink-strong"
        style={{ letterSpacing: -0.5 }}
        accessibilityRole="header"
      >
        {label}
      </Text>
    </View>
  );
}
