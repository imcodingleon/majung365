// 앱 설정이 변형마다 제대로 갈리는지 본다.
//
// **화면이 아니라 값을 테스트한다.** 막으려는 것은 `app.json`을 `app.config.ts`로
// 옮기면서 값 하나가 조용히 빠지는 사고다. 빠져도 빌드는 되고 아이콘이나 스플래시만
// 사라져서 눈으로는 늦게 발견된다.
//
// **전역이 아니라 가져와서 쓴다.** `expo/tsconfig.base`가 `types`를 좁혀 두어
// `describe`·`it`·`expect`가 전역으로 잡히지 않는다.
import { describe, expect, it } from "@jest/globals";

import buildConfig from "./app.config";

/**
 * 변형을 바꿔 설정을 읽는다.
 *
 * 팩토리가 **부르는 시점에** 환경변수를 보므로 모듈을 다시 읽을 필요가 없다.
 * 읽고 나면 환경변수를 원래대로 되돌려 다른 테스트에 번지지 않게 한다.
 */
function loadExpoConfig(variant?: "admin") {
  const before = process.env.APP_VARIANT;
  if (variant) process.env.APP_VARIANT = variant;
  else delete process.env.APP_VARIANT;

  const config = buildConfig().expo;

  if (before === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = before;

  return config;
}

/** `plugins` 안에서 이름으로 항목을 찾는다. 문자열로도 배열로도 들어가 있다. */
function findPlugin(plugins: readonly unknown[], name: string) {
  return plugins.find((p) => p === name || (Array.isArray(p) && p[0] === name));
}

/** 두 변형이 함께 지켜야 하는 값. 어느 쪽에서든 빠지면 안 된다. */
function expectSharedValues(variant?: "admin") {
  const c = loadExpoConfig(variant);
  expect(c.version).toBe("1.0.0");
  expect(c.orientation).toBe("portrait");
  expect(c.userInterfaceStyle).toBe("automatic");
  expect(c.owner).toBe("imcodingleons-team");
  expect(c.web.output).toBe("static");
  expect(c.ios.config.usesNonExemptEncryption).toBe(false);
  expect(c.android.predictiveBackGestureEnabled).toBe(false);
  expect(c.experiments.reactCompiler).toBe(true);

  expect(findPlugin(c.plugins, "expo-router")).toBeDefined();
  expect(findPlugin(c.plugins, "expo-splash-screen")).toBeDefined();
  expect(findPlugin(c.plugins, "expo-secure-store")).toBeDefined();
}

describe("출소자 앱 (APP_VARIANT 없음)", () => {
  it("이름과 식별자가 출소자 것이다", () => {
    const c = loadExpoConfig();
    expect(c.name).toBe("마중365");
    expect(c.slug).toBe("majung365");
    expect(c.scheme).toBe("majung365");
    expect(c.android.package).toBe("com.superbuilders.majung365");
    expect(c.ios.bundleIdentifier).toBe("com.superbuilders.majung365");
  });

  it("EAS 프로젝트가 기존 것이다", () => {
    expect(loadExpoConfig().extra.eas.projectId).toBe(
      "bb610f96-e51d-4f6e-a106-e113ea8a7cb3",
    );
  });

  it("라우트 루트를 옮기지 않는다", () => {
    expect(findPlugin(loadExpoConfig().plugins, "expo-router")).toBe("expo-router");
  });

  it("typedRoutes를 켠다", () => {
    expect(loadExpoConfig().experiments.typedRoutes).toBe(true);
  });

  it("공유 값이 남아 있다", () => {
    expectSharedValues();
  });
});

describe("담당자 앱 (APP_VARIANT=admin)", () => {
  it("이름과 식별자가 담당자 것이다", () => {
    const c = loadExpoConfig("admin");
    expect(c.name).toBe("마중365 담당자");
    expect(c.slug).toBe("majung365-admin");
    expect(c.scheme).toBe("majung365admin");
    expect(c.android.package).toBe("com.superbuilders.majung365.admin");
    expect(c.ios.bundleIdentifier).toBe("com.superbuilders.majung365.admin");
  });

  it("라우트 루트를 src/app-admin으로 옮긴다", () => {
    expect(findPlugin(loadExpoConfig("admin").plugins, "expo-router")).toEqual([
      "expo-router",
      { root: "./src/app-admin" },
    ]);
  });

  it("typedRoutes를 끈다", () => {
    expect(loadExpoConfig("admin").experiments.typedRoutes).toBe(false);
  });

  it("EAS 프로젝트가 출소자와 다르다", () => {
    const admin = loadExpoConfig("admin").extra.eas.projectId;
    expect(typeof admin).toBe("string");
    expect(admin).not.toBe("bb610f96-e51d-4f6e-a106-e113ea8a7cb3");
  });

  it("아이콘이 출소자 것과 다르다", () => {
    expect(loadExpoConfig("admin").icon).toBe("./assets/images/icon-admin.png");
    expect(loadExpoConfig().icon).toBe("./assets/images/icon.png");
  });

  it("공유 값이 남아 있다", () => {
    expectSharedValues("admin");
  });
});

describe("두 앱이 한 기기에 공존한다", () => {
  it("패키지와 번들 ID가 서로 다르다", () => {
    expect(loadExpoConfig().android.package).not.toBe(
      loadExpoConfig("admin").android.package,
    );
    expect(loadExpoConfig().ios.bundleIdentifier).not.toBe(
      loadExpoConfig("admin").ios.bundleIdentifier,
    );
  });

  it("변형을 읽어도 환경변수가 남지 않는다", () => {
    loadExpoConfig("admin");
    expect(process.env.APP_VARIANT).toBeUndefined();
  });
});
