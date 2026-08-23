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
// 이것은 임시 조치다. §8은 담당자 앱을 별도 빌드로 확정했고 `src/admin/`은 그 전제로
// 나눠 둔 폴더다. 별도 빌드가 생기면 이 blockList는 지운다.
const INCLUDE_ADMIN = process.env.INCLUDE_ADMIN === "1";

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
