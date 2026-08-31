// 시연 프레임의 부팅 라우트 (`/showcase/preview?screen=<화면>`).
//
// **여기서 하는 일은 둘뿐이다.** 목업을 켜고, 진짜 화면으로 넘긴다.
//
// 왜 화면을 여기서 직접 그리지 않는가
//   화면 컴포넌트를 이 라우트에서 렌더하면 하단 메뉴바가 나오지 않는다. 메뉴바는
//   `(tabs)/_layout.tsx`의 탭 네비게이터가 그리는 것이고, 그 그룹 안에 있는 화면만
//   받는다. 시연 이미지에서 메뉴바가 빠지면 앱이 아니라 낱장 화면으로 보인다.
//   그래서 **진짜 라우트로 넘긴다.**
//
// 여기까지 오는 데 걸린 것 셋을 적어 둔다. 셋 다 증상이 똑같아서(모든 프레임이 엉뚱한
// 화면으로 뜬다) 다시 만나면 원인을 다시 찾게 된다.
//
//   ① **`[screen].tsx` 동적 라우트가 안 된다.** 이 프로젝트의 expo-router는 그 파일을
//      동적 세그먼트가 아니라 `[screen]`이라는 글자 그대로의 경로로 등록한다
//      (`.expo/types/router.d.ts`에 `/showcase/preview/[screen]`이 리터럴로 찍힌다).
//      그래서 `/showcase/preview/alerts`가 아무 라우트에도 안 걸리고 진입점을 거쳐
//      홈으로 갔다. → 고정 라우트 하나에 쿼리로 화면을 지정한다.
//
//   ② **`router.replace("/alerts")`는 홈으로 간다.** 탭 그룹 바깥에서 부르면 탭
//      네비게이터가 자기 첫 화면으로 되돌아간다. → 그룹 이름을 붙여 `/(tabs)/alerts`로
//      부르면 그 칸이 잡힌다.
//
//   ③ **`window.location`으로 주소를 새로 열면 안 된다.** 개발 서버에서는 되는데
//      정적 배포본에서 목업이 통째로 꺼진다 — 내보내기가 라우트별로 모듈을 갈라서,
//      다른 주소를 열면 이 파일이 평가되지 않기 때문이다. 아홉 프레임이 전부 가입
//      화면으로 떨어졌다. → **문서를 떠나지 않는다.** 라우터로만 이동한다.
//
// **목업 설치가 모듈 최상단에 있는 것이 중요하다.** 이 코드는 React가 첫 화면을 그리기
// 전에 돈다. 루트 레이아웃의 `useRestoreSession`이 실서버로 요청을 내보내기 전에
// `fetch`가 이미 바뀌어 있어야 한다.
//
// **일반 라우트에는 아무 영향이 없다.** 판정이 경로 하나라서, `/today`를 그냥 열면
// 이 파일이 평가되더라도 설치 함수가 불리지 않는다.
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { type Href, router } from "expo-router";

import { installShowcaseMocks } from "@/showcase/installMocks";

/**
 * 찍을 수 있는 화면들. **껍데기(`src/showcase/shell.html`)의 목록과 짝이다.**
 *
 * 여기에 없는 이름으로 들어오면 홈으로 보낸다 — 오타 하나에 빈 프레임이 뜨는 것보다
 * 무엇이든 보이는 편이 시연에서 안전하다.
 */
const SCREENS = [
  "today",
  "alerts",
  "chats",
  "map",
  "my-info",
  "nearby",
  "pamphlet",
  "signup",
  "retake",
] as const;

/** 하단 메뉴바 안에 있는 화면들. 이동할 때 그룹 이름을 붙여야 그 칸이 잡힌다(위 ②). */
const TAB_SCREENS = new Set<string>(["today", "alerts", "chats", "map", "my-info"]);

/** 이 문서가 시연 프레임인가. */
function isShowcaseFrame(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/showcase/preview")
  );
}

// **평가 시점에 켠다.** 컴포넌트가 마운트된 뒤에 켜면 루트 레이아웃이 이미 서버를
// 부른 뒤가 된다.
if (isShowcaseFrame()) installShowcaseMocks();

/**
 * 어느 화면을 열 것인가.
 *
 * **주소를 직접 읽는다.** `useLocalSearchParams`는 첫 렌더에서 비어 있을 때가 있고,
 * 그 한 번의 빈 값으로 홈에 넘어가면 뒤늦게 값이 들어와도 이미 늦다.
 */
function targetScreen(): (typeof SCREENS)[number] {
  const asked = new URLSearchParams(window.location.search).get("screen");
  if (asked && SCREENS.includes(asked as (typeof SCREENS)[number])) {
    return asked as (typeof SCREENS)[number];
  }
  return "today";
}

export default function ShowcasePreviewRoute() {
  useEffect(() => {
    const name = targetScreen();
    const href = TAB_SCREENS.has(name) ? `/(tabs)/${name}` : `/${name}`;
    // `replace`라서 프레임의 뒤로 가기에 이 자리가 남지 않는다.
    router.replace(href as Href);
  }, []);

  // 넘어가는 사이에만 보이는 화면이다. 배경을 앱과 같은 색으로 두어 깜빡임이 눈에
  // 띄지 않게 한다.
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fafafa",
      }}
    >
      <ActivityIndicator size="large" color="#208AEF" />
    </View>
  );
}
