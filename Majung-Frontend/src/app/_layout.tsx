import "../global.css";

import { ActivityIndicator, Text, View } from "react-native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppFrame } from "@/shared/components/AppFrame";
import { RegionLookupProvider } from "@/shared/location";
import { COLORS } from "@/shared/theme/colors";
import { useRestoreSession } from "@/shared/utils/useRestoreSession";

// 루트 레이아웃. **하단 메뉴바는 `(tabs)/_layout.tsx`가 맡는다.**
//
// 가입·상황 다시 알아보기·팜플렛·담당자 화면은 그 그룹 밖에 있다 — 가입하는 중에
// 메뉴바가 보이면 안 되기 때문이다.
//
// 헤더는 각 화면이 직접 그린다(저리터러시 커스텀 UI).
//
// **세션 되살리기가 여기 있다** (§5.2). 화면마다 두면 어느 하나가 빠지고, 진입점에만
// 두면 웹에서 그 화면을 거치지 않는 경로가 생긴다 — `/today`를 열어 둔 채 새로고침하면
// 그 화면이 바로 뜨면서 진입점을 지나지 않는다. 세션이 없으니 가입 화면으로 보내졌고,
// 되살리기는 시도조차 되지 않았다.
/**
 * 화면 글꼴 (2026-08-31 · 디자이너 시안 반영).
 *
 * 이 앱은 시스템 기본 글꼴을 써 왔다. 그런데 시안이 Pretendard로 그려져 있고,
 * 자간과 한글 글자면 크기가 시스템 글꼴과 달라서 **같은 15px이라도 줄 길이가 달라진다.**
 * 글꼴을 두고 간격만 맞추면 나중에 글꼴을 넣을 때 그 간격이 다시 어긋난다. 그래서
 * 다른 화면을 손대기 전에 이것부터 깐다.
 *
 * **전체 판을 쓴다. `Pretendard Std`를 쓰면 안 된다.** 이름만 보면 한글 서브셋 같지만
 * **한글 음절이 한 글자도 들어 있지 않다**(11,172자 중 0자). 그것을 넣으면 화면의 한글이
 * 전부 시스템 글꼴로 되돌아가고 숫자와 라틴 문자만 Pretendard로 나온다. 실제로 한 번
 * 그렇게 넣었다가, 시안보다 글자가 얇아 보인다는 지적을 받고 찾아냈다.
 * 재어 보면 획 두께가 시안의 0.64배였고 글자 폭은 5.6% 넓었다.
 *
 * 굵기당 1.5MB라 다섯이면 7.7MB다. 서브셋으로 줄여도 1.3MB까지밖에 안 내려간다 —
 * 글리프 14,716개 중 11,172개가 한글이라 뺄 것이 별로 없다. 줄이는 이득이 작아서
 * 전체 판을 그대로 싣는다.
 *
 * **다섯 굵기를 다 싣는다.** 홈 화면 하나에서만 시안이 다섯을 쓰고 있었다. 굵기를
 * 줄이면 없는 굵기 자리를 기기가 억지로 만들어 내고, 그것은 진짜 굵기와 다르게 보인다.
 *
 * 굵기별로 파일 이름이 갈리는 것이 중요하다. 안드로이드는 `fontFamily` 하나에
 * `fontWeight`를 얹는 방식으로 굵기를 골라 주지 않는다.
 */
const FONTS = {
  "Pretendard-Regular": require("../../assets/fonts/Pretendard-Regular.otf"),
  "Pretendard-Medium": require("../../assets/fonts/Pretendard-Medium.otf"),
  "Pretendard-SemiBold": require("../../assets/fonts/Pretendard-SemiBold.otf"),
  "Pretendard-Bold": require("../../assets/fonts/Pretendard-Bold.otf"),
  "Pretendard-ExtraBold": require("../../assets/fonts/Pretendard-ExtraBold.otf"),
};

export default function RootLayout() {
  const { checking } = useRestoreSession();
  // 글꼴을 못 읽어도 화면은 띄운다. 읽기 실패로 앱이 멈추면 글꼴 하나 때문에
  // 아무것도 못 하게 되는데, 시스템 글꼴로라도 보이는 편이 낫다.
  const [fontsLoaded, fontError] = useFonts(FONTS);

  return (
    <SafeAreaProvider>
      {/* **지금 있는 곳을 화면들이 함께 본다.** 훅을 화면마다 부르면 각자 다른 곳을
          들게 되어, 지도에서 지역을 바꿔도 홈의 "가까운 곳"이 예전 지역에 머물렀다.
          `(tabs)`가 아니라 여기에 두는 것은 가입 화면이 탭 밖인데 이 값을 쓰기 때문이다 */}
      <RegionLookupProvider>
        <AppFrame>
        {/* 되살리는 동안에는 아무 화면도 그리지 않는다. 그리면 세션이 없는 상태로
            한 번 판단이 내려져, 되살아나기 전에 가입 화면으로 넘어가 버린다.
            글꼴 대기도 여기 얹는다 — 먼저 그리면 시스템 글꼴로 한 번 그려졌다가
            Pretendard로 바뀌면서 글자가 눈에 띄게 흔들린다 */}
        {checking || (!fontsLoaded && !fontError) ? (
          <View className="flex-1 items-center justify-center bg-page">
            <ActivityIndicator size="large" color={COLORS.brand} />
            <Text className="mt-4 text-body text-ink-sub">하시던 것을 불러오고 있어요…</Text>
          </View>
        ) : (
          <Stack screenOptions={{ headerShown: false }} />
        )}
        </AppFrame>
      </RegionLookupProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
