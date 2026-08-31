// 안 읽은 건수 배지. 아이콘 오른쪽 위에 붙는다.
//
// **0이면 그리지 않는다.** 0을 띄우면 읽을 것이 있다는 뜻으로 보인다. 숫자가 있고
// 없고로 "볼 것이 남았는가"를 알리는 것이 이 표시의 목적이다.
import { Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";
import { FONTS } from "@/shared/theme/fonts";

export function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  // 세 자리가 되면 칸을 넘는다. 두 자리에서 끊는다.
  const label = count > 99 ? "99+" : String(count);
  return (
    <View
      style={{
        position: "absolute",
        top: -4,
        right: -10,
        minWidth: 18,
        height: 18,
        paddingHorizontal: 5,
        borderRadius: 9,
        backgroundColor: COLORS.alert,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: COLORS.surface, fontSize: 11, fontFamily: FONTS.bold }}>{label}</Text>
    </View>
  );
}
