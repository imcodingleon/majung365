// 화면 검증(e2e) 설정.
//
// **jest와 갈래가 다르다.** jest는 `*.test.ts`만 주워 계산을 검증하고(`jest.config.js`),
// 이쪽은 `e2e/*.spec.ts`를 브라우저에서 돌려 **화면에 실제로 그렇게 보이는지**를 본다.
// 확장자를 갈라 두었으므로 서로 상대의 파일을 집어가지 않는다.
//
// 대부분의 테스트는 서버 응답을 가짜로 채운다 — 언제 돌려도 같은 결과가 나와야 하고,
// "어제"나 "8월 26일" 같은 날짜 표시는 실제 서버 데이터로는 만들 수 없다.
// 진짜 서버에 붙는 것은 `smoke.spec.ts` 하나뿐이다.
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 8340);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // **웹 번들을 말아 올리는 데 오래 걸린다.** 개발 서버가 코드 변경을 받아 다시 말고
  // 있으면 첫 페이지가 1분을 넘기기도 한다. 화면이 뜬 뒤의 판정은 `expect`가 짧게
  // 잡으므로, 여기만 넉넉히 두어도 실패를 늦게 알아채지는 않는다.
  timeout: 150_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // 개발 서버 하나를 여럿이 두드리면 번들 요청이 밀린다.
  workers: process.env.CI ? 2 : 3,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    // 번들을 다시 마는 동안은 첫 응답 자체가 늦다. 화면 판정과 갈라서 잡는다.
    navigationTimeout: 120_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // **웹은 `AppFrame`이 모든 화면을 440px에 묶는다.** 그 폭으로 본다.
        viewport: { width: 440, height: 900 },
        // 내려받은 chromium 대신 이미 깔린 크롬을 쓴다. 받을 것이 없다.
        channel: "chrome",
      },
    },
  ],
  webServer: {
    command: `npx expo start --web --port ${PORT}`,
    url: BASE_URL,
    // 이미 띄워 둔 개발 서버가 있으면 그것을 쓴다.
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
