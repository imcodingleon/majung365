# 관리자 앱 분리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 같은 코드베이스에서 출소자 앱과 담당자 앱을 따로 빌드해, 담당자 앱을 Play 내부 테스트 트랙에 올린다.

**Architecture:** 환경변수 `APP_VARIANT` 하나로 갈린다. 값이 없으면 출소자 앱이고 `admin`이면 담당자 앱이다. `app.json`을 `app.config.ts`로 바꿔 이름·패키지·EAS 프로젝트를 분기하고, `expo-router` 설정 플러그인의 `root` 옵션으로 라우트 루트를 `src/app/`와 `src/app-admin/`로 가른다. 코드는 옮기지 않으며 `src/admin/`·`src/shared/`·`src/features/visit/`를 양쪽이 공유한다.

**Tech Stack:** Expo SDK 57 · expo-router 57 · EAS CLI 21 · TypeScript strict · Jest(ts-jest, 계산만) · Pillow(아이콘 생성)

**Spec:** `docs/superpowers/specs/2026-08-26-admin-separate-app-design.md`

## Global Constraints

- 작업 디렉터리는 전부 `Majung-Frontend/`다. 명령은 그 안에서 실행한다
- **`APP_VARIANT`의 기본값은 출소자 앱이다.** 값이 없을 때 담당자 앱이 나오게 만들지 않는다. 잊었을 때 안전한 쪽으로 남아야 한다
- **`metro.config.js`의 blockList을 지우지 않는다.** 출소자 빌드에서는 앞으로도 계속 담당자 화면을 막아야 한다 (기획서 §8.4-4 · §12-26)
- **웹 `/admin`을 깨뜨리지 않는다.** 시연 중 앱이 안 뜰 때 쓰는 대체 경로이며 `vercel.json`의 `INCLUDE_ADMIN=1`이 그것을 싣는다 (스펙 §9)
- 서비스명 표기는 **마중365**다. 담당자 앱의 표시 이름은 **마중365 담당자**다
- 백엔드는 양쪽 앱이 같은 서버를 쓴다: `https://3-34-251-223.sslip.io`
- EAS 소유 계정은 `imcodingleons-team`이다
- 출소자 앱의 EAS 프로젝트 ID는 `bb610f96-e51d-4f6e-a106-e113ea8a7cb3`다
- 안드로이드 패키지와 iOS 번들 ID는 출소자가 `com.superbuilders.majung365`, 담당자가 `com.superbuilders.majung365.admin`이다
- 한글 문자열을 셀 때 **Git Bash의 `grep`을 쓰지 않는다.** 인코딩 때문에 한글을 놓쳐 "없다"는 잘못된 결과를 낸다. 파이썬이나 Node로 UTF-8을 명시해 센다
- 타입 검사는 `npx tsc --noEmit`으로 하며 오류 0을 확인한다

---

### Task 1: 담당자 앱 아이콘 만들기

두 앱을 한 기기에 함께 깔면 아이콘이 같아 시연하는 사람이 어느 쪽인지 구별하지 못한다. 색상환 반대편으로 색을 돌려 같은 마크의 다른 색 아이콘을 만든다.

**Files:**
- Create: `Majung-Frontend/assets/images/icon-admin.png`

**Interfaces:**
- Consumes: `assets/images/icon.png` (1024×1024 RGBA)
- Produces: `assets/images/icon-admin.png` (1024×1024 RGBA). Task 2의 `app.config.ts`가 담당자 변형에서 이 경로를 가리킨다

- [ ] **Step 1: 아이콘을 만든다**

```bash
cd Majung-Frontend
python3 -c "
from PIL import Image
im = Image.open('assets/images/icon.png').convert('RGBA')
r, g, b, a = im.split()
h, s, v = Image.merge('RGB', (r, g, b)).convert('HSV').split()
h = h.point(lambda p: (p + 128) % 256)
out = Image.merge('HSV', (h, s, v)).convert('RGB')
out.putalpha(a)
out.save('assets/images/icon-admin.png')
print('saved', out.size, out.mode)
"
```

- [ ] **Step 2: 크기와 모드를 확인한다**

```bash
cd Majung-Frontend
python3 -c "
from PIL import Image
im = Image.open('assets/images/icon-admin.png')
assert im.size == (1024, 1024), im.size
assert im.mode == 'RGBA', im.mode
print('OK', im.size, im.mode)
"
```

기대: `OK (1024, 1024) RGBA`

- [ ] **Step 3: 눈으로 확인한다**

파일을 열어 원본과 색이 다른지 본다. 원본은 파란색이고 결과는 주황색이어야 한다. 같은 색으로 보이면 Step 1이 실패한 것이므로 다시 실행한다.

- [ ] **Step 4: 커밋**

```bash
git add Majung-Frontend/assets/images/icon-admin.png
git commit -m "feat(admin): 담당자 앱 아이콘을 따로 둔다

두 앱을 한 기기에 깔면 아이콘이 같아 시연하는 사람이 구별하지 못한다.
같은 마크의 색만 색상환 반대편으로 돌렸다."
```

---

### Task 2: `app.json`을 `app.config.ts`로 옮기고 변형을 가른다

정적 JSON으로는 변형을 가를 수 없다. 값이 조용히 빠지는 것을 막기 위해 **테스트를 먼저 쓴다.** 값이 빠져도 빌드는 되고 아이콘이나 스플래시만 사라져서 눈으로는 늦게 발견된다.

**JS가 아니라 TS로 쓴다.** 테스트가 `import`로 가져다 쓸 수 있어 `require`도 모듈 재적재도 필요 없고, `npx tsc --noEmit`이 설정 파일까지 함께 검사한다.

**Files:**
- Create: `Majung-Frontend/app.config.test.ts`
- Create: `Majung-Frontend/app.config.ts`
- Delete: `Majung-Frontend/app.json`

**Interfaces:**
- Consumes: Task 1의 `assets/images/icon-admin.png`
- Produces: `app.config.ts`가 `export default () => ({ expo: {...} })` 꼴의 팩토리를 기본 내보내기로 낸다. **변형 판정은 팩토리 안에서 한다** — 모듈을 읽는 시점이 아니라 부르는 시점에 환경변수를 봐야 테스트가 한 번 가져와서 두 변형을 모두 확인할 수 있다. 담당자 EAS 프로젝트 ID를 담는 상수 `ADMIN_PROJECT_ID`가 파일 위쪽에 있고 지금은 `null`이며, **Task 6이 발급받은 값으로 바꾼다**

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`Majung-Frontend/app.config.test.ts`:

```ts
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
cd Majung-Frontend
npx jest app.config.test.ts
```

기대: FAIL. `Cannot find module './app.config'`

- [ ] **Step 3: `app.config.ts`를 쓴다**

`Majung-Frontend/app.config.ts`:

```ts
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
const ADMIN_PROJECT_ID: string | null = null;

// **판정을 팩토리 안에서 한다.** 모듈을 읽는 시점에 하면 환경변수를 바꿔도 결과가
// 그대로여서, 테스트가 두 변형을 한 번에 확인하지 못한다.
export default () => {
  const IS_ADMIN = process.env.APP_VARIANT === "admin";

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
        eas: { projectId: IS_ADMIN ? ADMIN_PROJECT_ID : USER_PROJECT_ID },
      },
      owner: "imcodingleons-team",
    },
  };
};
```

- [ ] **Step 4: `app.json`을 지운다**

```bash
cd Majung-Frontend
git rm app.json
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

```bash
cd Majung-Frontend
npx jest app.config.test.ts
```

기대: PASS. 실패 0.

- [ ] **Step 6: Expo가 두 변형을 실제로 해석하는지 대조한다**

테스트는 파일을 직접 부르지만, Expo가 플러그인까지 적용한 결과는 다를 수 있다. 눈으로 대조한다.

**`--json`을 반드시 붙인다.** 없으면 색 입힌 사람용 텍스트가 나와 파싱할 수 없다.

**출력 파일을 `/tmp`에 두지 않는다.** Git Bash의 `/tmp`와 윈도우 파이썬이 보는 경로가 달라 파일을 찾지 못한다. 프로젝트 안에 두고 확인 뒤 지운다.

**읽을 때 `encoding='utf-8'`을 명시한다.** 기본값이 cp949라 한글이 든 JSON에서 깨진다.

```bash
cd Majung-Frontend
npx expo config --type public --json > cfg-user.json
APP_VARIANT=admin npx expo config --type public --json > cfg-admin.json
python3 -c "
import json
def load(n): return json.load(open(n, encoding='utf-8'))
u, a = load('cfg-user.json'), load('cfg-admin.json')
for k in ('name', 'slug', 'scheme'):
    print(f'{k:8} {u.get(k)} -> {a.get(k)}')
print('android    ', u['android']['package'], '->', a['android']['package'])
print('ios        ', u['ios']['bundleIdentifier'], '->', a['ios']['bundleIdentifier'])
print('typedRoutes', u['experiments']['typedRoutes'], '->', a['experiments']['typedRoutes'])
assert u['android']['package'] != a['android']['package']
print('OK')
"
rm -f cfg-user.json cfg-admin.json
```

기대: 이름·slug·scheme·패키지·번들 ID가 모두 갈리고, `typedRoutes`가 `True -> False`이며, 마지막에 `OK`.

담당자 쪽 `extra.eas.projectId`는 이 단계에서 `{}`로 보인다. Expo가 `null`을 그렇게 바꾼 것이며 **Task 6이 실제 값을 넣을 때까지는 정상이다.**

- [ ] **Step 7: 타입 검사**

```bash
cd Majung-Frontend
npx tsc --noEmit
```

기대: 오류 0.

- [ ] **Step 8: 커밋**

```bash
git add Majung-Frontend/app.config.ts Majung-Frontend/app.config.test.ts
git commit -m "feat(build): 앱 설정을 변형 둘로 가른다 (APP_VARIANT)

app.json으로는 분기를 쓸 수 없어 app.config.ts로 옮기고 지웠다. 두 곳에
설정이 남으면 한쪽만 고치는 사고가 난다.

값이 조용히 빠지는 것을 막으려고 테스트를 먼저 썼다. 빠져도 빌드는 되고
아이콘이나 스플래시만 사라져 눈으로는 늦게 발견된다."
```

---

### Task 3: 담당자 변형이 실제로 뜨게 만든다

라우트 루트를 새로 만들고 metro가 담당자 구현을 막지 않게 한다. **둘은 함께 가야 한다.** 루트만 만들면 `@/admin`이 blockList에 걸려 빌드가 깨지고, metro만 고치면 띄울 화면이 없다.

**Files:**
- Create: `Majung-Frontend/src/app-admin/_layout.tsx`
- Create: `Majung-Frontend/src/app-admin/index.tsx`
- Modify: `Majung-Frontend/metro.config.js:15-20`

**Interfaces:**
- Consumes: `src/admin`의 `AdminApp` (`export { AdminApp } from "./views/AdminApp"`), `@/shared/components/AppFrame`의 `AppFrame`
- Produces: `APP_VARIANT=admin`으로 띄우면 담당자 로그인 화면이 첫 화면으로 뜬다

- [ ] **Step 1: metro 조건을 넓힌다**

`Majung-Frontend/metro.config.js`에서 아래 줄을 찾는다.

```js
const INCLUDE_ADMIN = process.env.INCLUDE_ADMIN === "1";
```

이렇게 바꾼다.

```js
const INCLUDE_ADMIN =
  process.env.INCLUDE_ADMIN === "1" || process.env.APP_VARIANT === "admin";
```

- [ ] **Step 2: 사실과 달라진 주석을 고친다**

같은 파일에서 아래 문단을 찾는다.

```
// 이것은 임시 조치다. §8은 담당자 앱을 별도 빌드로 확정했고 `src/admin/`은 그 전제로
// 나눠 둔 폴더다. 별도 빌드가 생기면 이 blockList는 지운다.
```

이렇게 바꾼다. **지우면 안 되고 조건이 하나 늘 뿐이다.**

```
// 담당자 앱을 따로 빌드할 때(`APP_VARIANT=admin`)는 막지 않는다. 그 변형은 라우트
// 루트가 `src/app-admin/`이라 출소자 화면이 애초에 열거되지 않고, 자기 구현인
// `@/admin`은 실려야 한다.
//
// **이 blockList은 지우지 않는다.** 출소자 빌드에서는 앞으로도 계속 막아야 한다.
```

- [ ] **Step 3: 담당자 루트 레이아웃을 쓴다**

`Majung-Frontend/src/app-admin/_layout.tsx`:

```tsx
import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppFrame } from "@/shared/components/AppFrame";

// 담당자 앱의 루트 레이아웃 (기획서 §8).
//
// **출소자 루트와 다른 점은 하나다 — 세션을 되살리지 않는다.** 담당자는 토큰을 기기에
// 저장하지 않으므로(§8.3) 되살릴 것이 없고, 넣으면 담당자 앱이 출소자 세션을
// 들여다보는 셈이 된다.
//
// `AppFrame`은 웹에서만 폭을 묶고 앱에서는 아무것도 하지 않는다. 시연 대체 경로인
// 웹 `/admin`과 모양을 맞추려고 그대로 둔다.
export default function AdminRootLayout() {
  return (
    <SafeAreaProvider>
      <AppFrame>
        <Stack screenOptions={{ headerShown: false }} />
      </AppFrame>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 4: 담당자 첫 화면을 쓴다**

`Majung-Frontend/src/app-admin/index.tsx`:

```tsx
import { AdminApp } from "@/admin";

// 담당자 앱의 첫 화면. 이 변형에서는 여기가 유일한 경로다.
//
// `src/app/admin.tsx`와 같은 것을 그린다. 두 파일이 함께 남아 있는 이유는 웹이다 —
// 시연 중 앱이 안 뜰 때 쓰는 대체 경로가 출소자 쪽 루트에 있다.
export default function AdminHome() {
  return <AdminApp />;
}
```

- [ ] **Step 5: 타입 검사**

```bash
cd Majung-Frontend
npx tsc --noEmit
```

기대: 오류 0.

- [ ] **Step 6: 담당자 변형을 띄워 눈으로 확인한다**

```bash
cd Majung-Frontend
APP_VARIANT=admin npx expo start --web
```

브라우저에서 첫 화면을 본다. 기대: **담당자 로그인 화면**이 뜨고 아이디·비밀번호 칸과 "들어가기" 버튼이 보인다.

확인한 뒤 서버를 끈다.

**여기가 `root` 옵션이 되는지 판명되는 자리다** (스펙 §10). 출소자 가입 화면이 뜨거나 라우트를 못 찾는다는 오류가 나면 먼저 Task 2 Step 6의 대조를 다시 본다. 거기서 `root`가 제대로 들어가 있는데도 화면이 틀리면 **`root` 옵션이 이 버전에서 듣지 않는 것이므로 멈추고 사용자에게 보고한다.** 스펙이 정해 둔 물러날 자리는 B안이며, 그것은 이 계획의 범위가 아니라 새 계획이 필요하다. 혼자 판단해 B안으로 바꾸지 않는다.

- [ ] **Step 7: 출소자 변형이 그대로인지 확인한다**

```bash
cd Majung-Frontend
npx expo start --web
```

기대: 출소자 첫 화면이 뜬다. 주소창에 `/admin`을 직접 넣으면 화면이 없다고 나온다.

확인한 뒤 서버를 끈다.

- [ ] **Step 8: 커밋**

```bash
git add Majung-Frontend/src/app-admin Majung-Frontend/metro.config.js
git commit -m "feat(admin): 담당자 앱의 라우트 루트를 따로 둔다

src/app-admin/이 담당자 변형의 루트다. 출소자 화면이 열거되지 않으므로
담당자 앱에 실리지 않는다.

루트 레이아웃에 useRestoreSession을 넣지 않았다. 담당자는 토큰을 기기에
저장하지 않아(§8.3) 되살릴 것이 없고, 넣으면 담당자 앱이 출소자 세션을
들여다보게 된다.

metro blockList은 지우지 않고 조건만 넓혔다. 출소자 빌드에서는 계속 막는다."
```

---

### Task 4: 다섯 가지 검증을 스크립트로 굳힌다

스펙 §7의 검증 셋·넷·다섯은 번들 안의 문자열을 세는 일이다. **이 프로젝트 결함의 반복 모양이 "한쪽만 고치고 짝을 안 보는 것"이므로 양쪽을 한 번에 세는 도구를 둔다.** 손으로 세면 한쪽을 빠뜨린다.

**Files:**
- Create: `Majung-Frontend/scripts/check-variant-bundles.mjs`

**Interfaces:**
- Consumes: `npx expo export -p web`가 만든 `dist/_expo/static/js/web/*.js`
- Produces: `node scripts/check-variant-bundles.mjs <dist경로> <user|admin|web>`가 통과하면 종료 코드 0, 새면 1

- [ ] **Step 1: 검사 스크립트를 쓴다**

`Majung-Frontend/scripts/check-variant-bundles.mjs`:

```js
// 번들에 무엇이 실렸는지 센다 (스펙 §7).
//
// **Git Bash의 grep을 쓰지 않는 이유가 있다.** 한글을 인코딩 때문에 놓쳐서
// "없다"는 잘못된 결과를 낸다. 실제로 그렇게 한 번 속았다. Node는 UTF-8을
// 그대로 읽으므로 여기서 센다.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// **고른 기준이 있다.** 담당자 앱에는 `src/admin`·`src/shared`·`src/features/visit`가
// 함께 실리므로, 그 계층에 있는 말은 골라도 아무것도 가리지 못한다. 아래 넷은
// 2026-08-26에 확인했고 각각 한 파일에만 있다.

/** 담당자 화면에만 있는 말. 둘 다 `src/admin/views/AdminLoginScreen.tsx`에 있다. */
const ADMIN_MARKS = ["들어가기", "확인하는 중이에요"];

/** 출소자 라우트에만 있는 말. `src/app/signup.tsx`와 `src/app/(tabs)/alerts.tsx`에 있다. */
const USER_MARKS = ["적어 주신 내용을 다시 확인해 주세요.", "알림 목록으로 돌아가기"];

const MODES = {
  // 출소자 앱: 담당자 말이 하나도 없어야 한다
  user: { forbid: ADMIN_MARKS, require: USER_MARKS },
  // 담당자 앱: 출소자 말이 하나도 없어야 한다
  admin: { forbid: USER_MARKS, require: ADMIN_MARKS },
  // 시연 대체 경로용 웹: 둘 다 있어야 한다
  web: { forbid: [], require: [...ADMIN_MARKS, ...USER_MARKS] },
};

const [distDir, mode] = process.argv.slice(2);
if (!distDir || !MODES[mode]) {
  console.error("사용법: node scripts/check-variant-bundles.mjs <dist경로> <user|admin|web>");
  process.exit(2);
}

const jsDir = join(distDir, "_expo", "static", "js", "web");
const bundles = readdirSync(jsDir).filter((f) => f.endsWith(".js"));
if (bundles.length === 0) {
  console.error(`번들을 찾지 못했다: ${jsDir}`);
  process.exit(2);
}

const text = bundles.map((f) => readFileSync(join(jsDir, f), "utf8")).join("\n");
console.log(`번들 ${bundles.length}개, ${text.length.toLocaleString()}자 (${mode})`);

const { forbid, require: needed } = MODES[mode];
let failed = false;

for (const mark of forbid) {
  const n = text.split(mark).length - 1;
  console.log(`  없어야 함  ${mark}  → ${n}`);
  if (n > 0) failed = true;
}
for (const mark of needed) {
  const n = text.split(mark).length - 1;
  console.log(`  있어야 함  ${mark}  → ${n}`);
  if (n === 0) failed = true;
}

console.log(failed ? "실패" : "통과");
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: 검사에 쓰는 말이 실제로 코드에 있는지 확인한다**

**스크립트가 없는 말을 세면 언제나 통과한다.** 어느 파일에 있는지 짐작하지 말고 `src/` 전체에서 찾는다.

**콘솔이 한글을 깨뜨리므로 결과를 파일로 내보내 읽는다.** Git Bash의 출력 인코딩이 cp949라 화면으로는 판독할 수 없다.

```bash
cd Majung-Frontend
python3 -c "
import pathlib, io
MARKS = {
    'admin': ['들어가기', '확인하는 중이에요'],
    'user': ['적어 주신 내용을 다시 확인해 주세요.', '알림 목록으로 돌아가기'],
}
ADMIN_REACH = ('src/admin', 'src/shared', 'src/features/visit', 'src/app-admin')
files = list(pathlib.Path('src').rglob('*.ts')) + list(pathlib.Path('src').rglob('*.tsx'))
out, ok = io.StringIO(), True
for side, marks in MARKS.items():
    for m in marks:
        hits = [f.as_posix() for f in files if m in f.read_text(encoding='utf-8')]
        shared = [h for h in hits if h.startswith(ADMIN_REACH)]
        bad = (not hits) or (side == 'user' and shared)
        ok = ok and not bad
        out.write(f'[{side}] {m}\n  {len(hits)}곳 {hits}\n  담당자에도 실림: {shared}\n')
out.write('OK' if ok else 'FIX NEEDED')
pathlib.Path('marks-probe.txt').write_text(out.getvalue(), encoding='utf-8')
"
```

`Majung-Frontend/marks-probe.txt`를 열어 확인한다. 기대: 네 개 모두 1곳에서 찾히고, **출소자 문구는 "담당자에도 실림"이 비어 있으며**, 마지막 줄이 `OK`다.

`FIX NEEDED`가 나오면 그 말이 바뀌었거나 공유 계층으로 옮겨 간 것이다. `src/app/` 아래에서 **그 화면에만 있는 다른 문구**를 골라 스크립트의 `USER_MARKS`를 고친다. `src/shared`나 `src/features/visit`에 있는 말은 담당자 앱에도 실리므로 고르면 안 된다. "확인"·"취소" 같은 흔한 말도 고르지 않는다.

확인이 끝나면 `marks-probe.txt`를 지운다. 커밋하지 않는다.

- [ ] **Step 3: 담당자 변형을 내보내고 검사한다**

```bash
cd Majung-Frontend
rm -rf dist
APP_VARIANT=admin npx expo export -p web
node scripts/check-variant-bundles.mjs dist admin
```

기대: 출소자 말이 0, 담당자 말이 1 이상, 마지막에 `통과`.

- [ ] **Step 4: 출소자 변형을 내보내고 검사한다**

`INCLUDE_ADMIN`을 주지 않는다. 이것이 스토어에 나가는 네이티브 빌드와 같은 조건이다.

```bash
cd Majung-Frontend
rm -rf dist
npx expo export -p web
node scripts/check-variant-bundles.mjs dist user
```

기대: 담당자 말이 0, 출소자 말이 1 이상, 마지막에 `통과`. **여기서 담당자 말이 검출되면 지금 Play에 올라가 있는 앱도 새고 있다는 뜻이므로 즉시 멈추고 보고한다.**

- [ ] **Step 5: 시연 대체 경로인 웹이 깨지지 않았는지 확인한다**

`vercel.json`이 쓰는 것과 같은 명령이다.

```bash
cd Majung-Frontend
rm -rf dist
INCLUDE_ADMIN=1 npx expo export -p web
node scripts/check-variant-bundles.mjs dist web
ls dist/admin.html
```

기대: 둘 다 1 이상이라 `통과`, 그리고 `dist/admin.html`이 있다. 없으면 웹 대체 경로가 깨진 것이므로 멈추고 보고한다.

- [ ] **Step 6: 내보낸 것을 지운다**

```bash
cd Majung-Frontend
rm -rf dist
```

- [ ] **Step 7: 커밋**

```bash
git add Majung-Frontend/scripts/check-variant-bundles.mjs
git commit -m "test(build): 두 변형의 번들에 무엇이 실렸는지 센다

한쪽만 고치고 짝을 안 보는 것이 이 프로젝트 결함의 반복 모양이라, 양쪽을
한 번에 세는 도구를 둔다.

Git Bash의 grep은 쓰지 않는다. 한글을 인코딩 때문에 놓쳐서 없다는 잘못된
결과를 낸다. 실제로 한 번 속았다."
```

---

### Task 5: `eas.json`에 담당자 프로필을 더한다

**Files:**
- Modify: `Majung-Frontend/eas.json`

**Interfaces:**
- Consumes: Task 2의 `APP_VARIANT` 분기
- Produces: 빌드 프로필 `admin-preview`·`admin-production`, 제출 프로필 `admin-production`

- [ ] **Step 1: 프로필을 더한다**

`Majung-Frontend/eas.json`을 아래로 바꾼다. 기존 프로필은 손대지 않는다.

```json
{
  "cli": {
    "version": ">= 16.0.0",
    "appVersionSource": "local"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {},
    "admin-preview": {
      "distribution": "internal",
      "env": {
        "APP_VARIANT": "admin"
      },
      "android": {
        "buildType": "apk"
      }
    },
    "admin-production": {
      "env": {
        "APP_VARIANT": "admin"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-play-service-account.json",
        "track": "internal"
      }
    },
    "admin-production": {
      "android": {
        "serviceAccountKeyPath": "./google-play-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

- [ ] **Step 2: EAS가 프로필을 읽는지 확인한다**

```bash
cd Majung-Frontend
python3 -c "
import json
c = json.load(open('eas.json'))
for name in ('admin-preview', 'admin-production'):
    p = c['build'][name]
    assert p['env']['APP_VARIANT'] == 'admin', name
    print(name, '->', p['env'])
assert c['submit']['admin-production']['android']['track'] == 'internal'
print('OK')
"
```

기대: 두 프로필이 찍히고 `OK`.

- [ ] **Step 3: 커밋**

```bash
git add Majung-Frontend/eas.json
git commit -m "chore(build): 담당자 앱 빌드·제출 프로필을 더한다

admin-preview는 기기에 바로 까는 APK, admin-production은 Play 내부 테스트에
올리는 AAB다. 서비스 계정 키는 출소자 앱과 같은 것을 쓴다 — 키 하나로 같은
개발자 계정의 두 앱을 모두 올릴 수 있다."
```

---

### Task 6: 담당자용 EAS 프로젝트를 만들고 ID를 적는다

> **사람이 해야 하는 단계가 섞여 있다.** `eas init`은 Expo 계정 인증을 쓴다. 로그인이 풀려 있으면 사용자에게 요청한다.

**Files:**
- Modify: `Majung-Frontend/app.config.ts` (`ADMIN_PROJECT_ID` 상수)
- Modify: `Majung-Frontend/app.config.test.ts` (담당자 프로젝트 ID 확인을 더한다)

**Interfaces:**
- Consumes: Task 2의 `ADMIN_PROJECT_ID = null`
- Produces: `ADMIN_PROJECT_ID`가 실제 UUID 문자열이 되어 담당자 변형이 EAS 빌드를 돌릴 수 있다

- [ ] **Step 1: 담당자 프로젝트를 만든다**

```bash
cd Majung-Frontend
APP_VARIANT=admin npx eas-cli init --account imcodingleons-team --non-interactive
```

**동적 설정 파일이라 EAS가 값을 써 넣지 못하고 대신 ID를 알려 준다.** 출력에서 UUID를 받아 적는다. 명령이 그 사정으로 0이 아닌 코드로 끝날 수 있는데, 프로젝트는 만들어졌으므로 출력의 ID를 쓰면 된다.

ID가 출력에 없으면 대시보드에서 확인한다: `https://expo.dev/accounts/imcodingleons-team/projects/majung365-admin`

- [ ] **Step 2: ID를 `app.config.ts`에 적는다**

`ADMIN_PROJECT_ID`를 받은 값으로 바꾼다.

```js
const ADMIN_PROJECT_ID = "여기에-발급받은-UUID";
```

- [ ] **Step 3: 테스트에 확인을 더한다**

`app.config.test.ts`의 `describe("담당자 앱 (APP_VARIANT=admin)")` 안에 아래를 더한다.

```ts
  it("EAS 프로젝트가 출소자와 다르다", () => {
    const admin = loadExpoConfig("admin").extra.eas.projectId;
    expect(typeof admin).toBe("string");
    expect(admin).not.toBe("bb610f96-e51d-4f6e-a106-e113ea8a7cb3");
  });
```

- [ ] **Step 4: 테스트를 돌린다**

```bash
cd Majung-Frontend
npx jest app.config.test.ts
```

기대: PASS.

- [ ] **Step 5: 백엔드 주소를 새 프로젝트에 등록한다**

EAS 환경변수는 프로젝트 단위라서 새 프로젝트에는 없다. 세 환경 모두에 넣는다.

```bash
cd Majung-Frontend
APP_VARIANT=admin npx eas-cli env:create --scope project \
  --environment production --environment preview --environment development \
  --name EXPO_PUBLIC_API_URL --value https://3-34-251-223.sslip.io \
  --visibility plaintext --type string --non-interactive
```

- [ ] **Step 6: 등록됐는지 확인한다**

```bash
cd Majung-Frontend
APP_VARIANT=admin npx eas-cli env:list --environment production
```

기대: `EXPO_PUBLIC_API_URL`이 보인다.

- [ ] **Step 7: 커밋**

```bash
git add Majung-Frontend/app.config.ts Majung-Frontend/app.config.test.ts
git commit -m "chore(build): 담당자 앱의 EAS 프로젝트를 잇는다

eas init은 동적 설정 파일에 값을 써 넣지 못해 손으로 적었다. 두 앱의
프로젝트 ID가 서로 다른지 테스트로 묶어 둔다."
```

---

### Task 7: 담당자 앱을 기기에서 확인한다

> **사람이 해야 한다.** 빌드 결과를 실제 안드로이드 기기에 깔아 눈으로 본다.

**Files:** 없음. 빌드와 확인만 한다.

**Interfaces:**
- Consumes: Task 5의 `admin-preview` 프로필, Task 6의 프로젝트 ID와 환경변수
- Produces: 기기에 깔린 담당자 앱. 출소자 앱과 아이콘·이름이 구별되고 로그인이 서버까지 닿는다

- [ ] **Step 1: 담당자 APK를 빌드한다**

```bash
cd Majung-Frontend
npx eas-cli build --profile admin-preview --platform android --non-interactive
```

빌드는 10~20분 걸린다. 끝나면 설치 링크와 QR이 나온다.

- [ ] **Step 2: 기기에 깐다**

QR을 안드로이드 기기로 찍어 APK를 받아 설치한다. 스토어 밖 설치라 경고가 몇 번 뜨는데 넘긴다.

- [ ] **Step 3: 다섯 가지를 눈으로 확인한다**

| # | 확인할 것 | 기대 |
|---|---|---|
| 1 | 앱 이름 | 마중365 담당자 |
| 2 | 아이콘 | 출소자 앱과 색이 다르다 (주황 계열) |
| 3 | 첫 화면 | 담당자 로그인 화면 |
| 4 | 출소자 앱과 공존 | 둘 다 깔려 있고 서로 지우지 않는다 |
| 5 | 로그인 | 시연 계정으로 들어가면 요청 목록이 뜬다 |

5번이 실패하면 `EXPO_PUBLIC_API_URL`이 빌드에 안 들어간 것이다. Task 6 Step 5부터 다시 본다.

- [ ] **Step 4: 결과를 보고한다**

커밋할 것은 없다. 확인 결과를 사용자에게 알린다. 실패한 항목이 있으면 다음 작업으로 넘어가지 않는다.

---

### Task 8: Play에 새 앱으로 등록하고 내부 테스트에 올린다

> **거의 전부 사람이 해야 한다.** Play Console은 웹에서 클릭해야 하는 절차이며 자동화할 수 없다.

**Files:** 없음. 빌드와 제출만 한다.

**Interfaces:**
- Consumes: Task 5의 `admin-production` 빌드·제출 프로필, `google-play-service-account.json`
- Produces: Play 내부 테스트 트랙에 올라간 담당자 앱

- [ ] **Step 1: Play Console에서 앱을 새로 만든다**

`https://play.google.com/console` → 앱 만들기

- 앱 이름: **마중365 담당자**
- 기본 언어: 한국어
- 앱 또는 게임: 앱 / 무료
- 자동 보호: 켠 채로 둔다

- [ ] **Step 2: 담당자 화면 스크린샷을 뽑는다**

```bash
cd Majung-Frontend
APP_VARIANT=admin npx expo start --web
```

브라우저를 720×1280(9:16)으로 잡고 로그인 화면과 요청 목록 화면을 각각 캡처한다. 최소 2장이 필요하다. 10인치 태블릿 칸에는 1080×1920으로 다시 뽑는다.

- [ ] **Step 3: 스토어 등록정보를 채운다**

아이콘(512×512)과 그래픽 이미지(1024×500)를 먼저 만든다. 출소자 앱 것과 같은 방식으로 만들되 색과 문구를 담당자용으로 바꾼다.

```bash
cd Majung-Frontend
python3 -c "
from PIL import Image, ImageDraw, ImageFont

# 스토어용 아이콘 — 담당자 아이콘을 512로 줄인다
Image.open('assets/images/icon-admin.png').convert('RGBA').resize(
    (512, 512), Image.LANCZOS
).save('store-assets/icon-admin-512.png')

# 그래픽 이미지 1024x500
W, H = 1024, 500
img = Image.new('RGB', (W, H), (55, 71, 79))
draw = ImageDraw.Draw(img)
icon = Image.open('assets/images/icon-admin.png').convert('RGBA').resize((320, 320), Image.LANCZOS)
img.paste(icon, (80, (H - 320) // 2), icon)
tx = 80 + 320 + 60
draw.text((tx, H // 2 - 90), '마중365', font=ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf', 96), fill=(255, 255, 255))
draw.text((tx, H // 2 + 30), '담당자용 업무 도구', font=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 38), fill=(207, 216, 220))
img.save('store-assets/feature-graphic-admin.png')
print('saved')
"
```

- 아이콘: `store-assets/icon-admin-512.png`
- 그래픽 이미지: `store-assets/feature-graphic-admin.png`
- 간단한 설명: `한국법무보호복지공단 담당자용 방문 요청 확인 도구`
- 자세한 설명: 담당자가 방문 요청을 확인하고 일정을 조율하는 업무용 도구임을 적는다. **출소자용 앱이 아니라는 것을 분명히 적는다**

- [ ] **Step 4: 앱 콘텐츠 선언을 채운다**

**출소자 앱의 답을 그대로 옮기지 않는다.** 담당자 앱은 타인의 정보를 열람하는 업무 도구라 답이 다르다.

- 개인정보처리방침: 출소자 앱과 같은 주소를 쓴다 (`https://majung365-privacy-skwogusdld-3354s-projects.vercel.app`)
- 로그인 세부정보: **로그인이 필요하다.** 시연 계정을 심사용으로 적어 준다
- 광고: 포함하지 않는다
- 타겟층: 만 18세 이상
- 정부 앱·금융 기능·건강: 해당 없음
- 데이터 보안: 요구받으면 **담당자 앱 기준으로 새로 쓴다.** 위치 정보를 쓰지 않는다는 점이 출소자 앱과 다르다

- [ ] **Step 5: AAB를 빌드한다**

```bash
cd Majung-Frontend
npx eas-cli build --profile admin-production --platform android --non-interactive
```

- [ ] **Step 6: 내부 테스트 트랙에 올린다**

```bash
cd Majung-Frontend
npx eas-cli submit --platform android --profile admin-production --non-interactive
```

기대: `Submitted your app to Google Play Store!`

`PERMISSION_DENIED`가 나오면 서비스 계정이 새 앱에 권한이 없는 것이다. Play Console의 사용자 및 권한에서 `eas-submit@majung365.iam.gserviceaccount.com`에 **마중365 담당자** 앱의 "앱을 테스트 트랙으로 출시" 권한을 준다.

- [ ] **Step 7: 테스터를 넣고 링크를 받는다**

Play Console → 테스트 및 출시 → 테스트 → 내부 테스트 → 테스터 탭에서 이메일 목록에 시연할 팀원을 넣는다. 앱 설정 체크리스트가 끝나고 검토가 통과하면 참여 링크가 나온다.

- [ ] **Step 8: 결과를 보고한다**

커밋할 것은 없다. 제출 결과와 링크 상태를 사용자에게 알린다.

---

## 나중에 할 일

계획 밖이지만 잊지 않도록 적어 둔다.

- **iOS 담당자 앱.** 번들 ID는 `com.superbuilders.majung365.admin`으로 이미 잡혀 있다. 애플 개발자 팀 반영이 끝난 뒤 기기 등록이 필요 없는 TestFlight 내부 테스트가 ad-hoc 배포보다 나은지 판단해 진행한다
- **§12-26을 닫는다.** 시연이 끝나면 `vercel.json`의 `INCLUDE_ADMIN=1`을 지워 공개 웹의 담당자 화면을 없앤다. 지금은 시연 대체 경로로 의도해 남긴 것이다 (스펙 §9)
