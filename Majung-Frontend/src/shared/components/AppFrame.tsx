// 웹에서 화면 폭을 모바일 크기로 묶는다.
//
// **본선은 앱이고 웹은 심사·시연용이다** (기획서 §2.6). 화면은 모바일 단일 프레임으로
// 설계했는데, 데스크톱 브라우저에서 열면 그대로 가로로 늘어난다. 큰 글씨 전제로 잡은
// 여백과 줄바꿈이 무너지고, 심사위원이 처음 보는 화면이 그 상태다.
//
// **앱에서는 아무것도 하지 않는다.** 기기 화면이 이미 이 폭이다.
import { Platform, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";

/** 모바일 프레임 폭. 큰 기기(iPhone Pro Max·갤럭시 울트라)의 가로폭에 맞춘다. */
const FRAME_WIDTH = 440;

export function AppFrame({
  children,
  /**
   * 프레임 바깥을 비워 둔다. **덮개가 반투명한 팝업에 쓴다** — 바깥을 칠하면
   * 뒤 화면이 가려져서, 팝업이 무엇 위에 떠 있는지 보이지 않는다.
   */
  transparent,
}: {
  children: React.ReactNode;
  transparent?: boolean;
}) {
  if (Platform.OS !== "web") return <>{children}</>;

  return (
    <View
      className="flex-1 items-center"
      style={transparent ? undefined : { backgroundColor: COLORS.frameOutside }}
    >
      <View className="w-full flex-1" style={{ maxWidth: FRAME_WIDTH }}>
        {children}
      </View>
    </View>
  );
}
