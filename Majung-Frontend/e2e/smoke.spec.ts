// 진짜 서버에 붙어 보는 확인.
//
// **나머지 테스트는 서버 응답을 가짜로 채운다.** 그래야 언제 돌려도 같은 결과가 나오고
// 날짜 시나리오를 만들 수 있다. 다만 그것만으로는 **서버 계약이 바뀌어 어긋나는 것**을
// 못 잡는다. 이 파일이 그 자리를 맡는다.
//
// 돌리려면 가입된 계정의 세션 토큰이 필요하다.
//   브라우저에서 앱을 연 뒤 개발자 도구 콘솔에 `localStorage.getItem("majung.session")`
//
//   E2E_TOKEN=<토큰> npx playwright test e2e/smoke.spec.ts
//
// 토큰이 없으면 통째로 건너뛴다 — 없다고 실패로 세면 평소 검증이 늘 빨갛다.
import { expect, test } from "@playwright/test";

const TOKEN = process.env.E2E_TOKEN;
const TOKEN_KEY = "majung.session";

test.describe("실제 서버", () => {
  test.skip(!TOKEN, "E2E_TOKEN이 없어 건너뛴다");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ([key, token]) => window.localStorage.setItem(key, token),
      [TOKEN_KEY, TOKEN ?? ""] as const,
    );
  });

  test("세션을 되살려 할 일을 받아온다", async ({ page }) => {
    await page.goto("/today");

    await expect(page.getByText("오늘의 할 일")).toBeVisible({ timeout: 30_000 });
    // 할 일이 하나도 없으면 서버 판정이 무너진 것이다.
    await expect(page.getByText(/\d+개 중 \d+개 완료/)).toBeVisible();
  });

  test("물어보면 답이 끝까지 온다", async ({ page }) => {
    await page.goto("/today");
    await expect(page.getByText("오늘의 할 일")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "AI 챗봇과 대화하기" }).first().click();
    await page.getByRole("button", { name: "오늘 뭐 해야 해요?" }).click();

    await expect(page.getByLabel("답을 찾고 있어요")).toBeVisible();
    // 답이 다 오면 기다림 표시가 사라진다. LLM이라 넉넉히 준다.
    await expect(page.getByLabel("답을 찾고 있어요")).toBeHidden({ timeout: 90_000 });
    // 근거 배지는 서버가 자료를 실제로 찾아 붙였다는 표시다 (§6.4).
    await expect(page.getByText("확인한 자료를 참고했어요").first()).toBeVisible();
  });
});
