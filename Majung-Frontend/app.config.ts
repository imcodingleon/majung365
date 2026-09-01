// 이 파일이 앱 둘을 만든다 — 출소자 앱과 담당자 앱 (기획서 §8).
//
// **`APP_VARIANT` 하나로 갈린다.** 값이 없으면 출소자 앱이다. **기본값이 출소자인
// 것이 중요하다** — 잊었을 때 안전한 쪽으로 남는다.
//
// 정적 `app.json`으로는 이 분기를 쓸 수 없어 설정 파일을 바꿨다. **`app.json`은
// 지웠다.** 두 곳에 설정이 남아 있으면 어느 쪽이 이기는지 헷갈리고, 한쪽만 고치는
// 사고가 난다.

/** 출소자 앱의 EAS 프로젝트. 2026-08-26에 발급했다. */
const USER_PROJECT_ID = "bb610f96-e51d-4f6e-a106-e113ea8a7cb3";

/**
 * 담당자 앱의 EAS 프로젝트.
 *
 * **`eas init`은 동적 설정 파일에 값을 써 넣지 못해 손으로 적는다.** 발급 전에는
 * `null`이고, 그동안 담당자 변형은 EAS 빌드를 돌릴 수 없다. 로컬 실행은 된다.
 */
const ADMIN_PROJECT_ID: string | null = "2bef8d43-a4f6-4cf5-9ea0-1e5daa1b739a";

// **판정을 팩토리 안에서 한다.** 모듈을 읽는 시점에 하면 환경변수를 바꿔도 결과가
// 그대로여서, 테스트가 두 변형을 한 번에 확인하지 못한다.
export default () => {
  const IS_ADMIN = process.env.APP_VARIANT === "admin";
  const projectId = IS_ADMIN ? ADMIN_PROJECT_ID : USER_PROJECT_ID;

  return {
    expo: {
      name: IS_ADMIN ? "마중365 담당자" : "마중365",
      slug: IS_ADMIN ? "majung365-admin" : "majung365",
      version: "1.0.0",
      orientation: "portrait",
      icon: IS_ADMIN ? "./assets/images/icon-admin.png" : "./assets/images/icon.png",
      scheme: IS_ADMIN ? "majung365admin" : "majung365",
      userInterfaceStyle: "automatic",
      ios: {
        icon: IS_ADMIN ? "./assets/images/icon-admin.png" : "./assets/expo.icon",
        bundleIdentifier: IS_ADMIN
          ? "com.superbuilders.majung365.admin"
          : "com.superbuilders.majung365",
        buildNumber: "1",
        config: { usesNonExemptEncryption: false },
      },
      android: {
        package: IS_ADMIN
          ? "com.superbuilders.majung365.admin"
          : "com.superbuilders.majung365",
        versionCode: 1,
        // 담당자 쪽은 배경 그림을 빼고 색만 달리한다. 배경 그림이 있으면
        // backgroundColor가 무시되어 두 앱의 아이콘이 같아진다.
        adaptiveIcon: IS_ADMIN
          ? {
              backgroundColor: "#37474F",
              foregroundImage: "./assets/images/android-icon-foreground.png",
            }
          : {
              backgroundColor: "#E6F4FE",
              foregroundImage: "./assets/images/android-icon-foreground.png",
              backgroundImage: "./assets/images/android-icon-background.png",
              monochromeImage: "./assets/images/android-icon-monochrome.png",
            },
        predictiveBackGestureEnabled: false,
      },
      web: {
        output: "static",
        favicon: "./assets/images/favicon.png",
      },
      plugins: [
        // 담당자 앱은 라우트 루트가 다르다. 출소자 화면이 애초에 열거되지 않는다.
        IS_ADMIN ? ["expo-router", { root: "./src/app-admin" }] : "expo-router",
        [
          "expo-splash-screen",
          {
            backgroundColor: IS_ADMIN ? "#37474F" : "#208AEF",
            image: "./assets/images/splash-icon.png",
            imageWidth: 76,
          },
        ],
        "expo-secure-store",
      ],
      experiments: {
        // **루트가 바뀌면 생성되는 라우트 타입도 바뀐다.** 켜 둔 채 변형을 오가면
        // 출소자 코드에 헛된 타입 오류가 남는다.
        typedRoutes: !IS_ADMIN,
        reactCompiler: true,
      },
      extra: {
        router: {},
        // **값이 없으면 키 자체를 뺀다.** `null`을 두면 Expo가 `{}`로 바꿔 넘기고,
        // `eas init`이 그것을 기존 프로젝트 ID로 읽어 GraphQL 단계에서 죽는다.
        eas: projectId ? { projectId } : {},
      },
      owner: "imcodingleons-team",
    },
  };
};
