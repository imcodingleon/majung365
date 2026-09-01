// Metro + NativeWind 4. global.css를 NativeWind 입력으로 연결한다.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// ── 담당자 화면은 기본으로 빌드에서 빠진다 (§8.3-4 · §12-26).
//
// expo-router는 파일 기반이라 `src/app/admin.tsx`가 있으면 **그대로 공개 주소의
// /admin이 된다.** 배포하면 담당자 로그인 화면이 누구에게나 열린다.
//
// **`EXPO_PUBLIC_`으로 가릴 수 없다.** 그 값은 번들에 그대로 박히고, 화면을 숨겨도
// 담당자 자격이 번들 안에 남는다. 그래서 화면을 숨기는 대신 **코드를 아예 넣지 않는다.**
//
// 켜는 법: `INCLUDE_ADMIN=1 npx expo start --web` — 개발과 시연에서만 쓴다.
// **기본값이 제외인 것이 중요하다.** 켜야 들어가면 잊어도 안전한 쪽으로 남는다.
//
// 담당자 앱을 따로 빌드할 때(`APP_VARIANT=admin`)는 막지 않는다. 그 변형은 라우트
// 루트가 `src/app-admin/`이라 출소자 화면이 애초에 열거되지 않고, 자기 구현인
// `@/admin`은 실려야 한다.
//
// **이 blockList은 지우지 않는다.** 출소자 빌드에서는 앞으로도 계속 막아야 한다.
const INCLUDE_ADMIN =
  process.env.INCLUDE_ADMIN === "1" || process.env.APP_VARIANT === "admin";

if (!INCLUDE_ADMIN) {
  // 라우트와 구현을 함께 막는다. 라우트만 막으면 `@/admin`을 부르는 다른 곳이 생겼을 때
  // 구현이 조용히 다시 들어온다.
  //
  // 절대경로를 정규식으로 조립하지 않는다 — 윈도우 백슬래시 이스케이프가 틀리기 쉽고,
  // **틀려도 아무것도 막지 않은 채 조용히 지나간다**(실제로 두 번 그랬다).
  // 경로 조각을 리터럴로 적어 눈으로 확인할 수 있게 둔다.
  const blocked = [/[\\/]src[\\/]admin([\\/]|$)/, /[\\/]src[\\/]app[\\/]admin\.tsx$/];

  const before = config.resolver.blockList;
  const list = before ? (Array.isArray(before) ? before : [before]) : [];
  config.resolver.blockList = [...list, ...blocked];
}

module.exports = withNativeWind(config, { input: "./src/global.css" });
