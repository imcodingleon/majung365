// 가입 화면 (§2.4·§3).
import { expect, test } from "@playwright/test";

import { openApp } from "./support/app";

test.describe("가입", () => {
  test("가입하지 않은 사람은 가입 화면으로 간다", async ({ page }) => {
    await openApp(page, "/", { signedIn: false });

    await expect(page.getByRole("textbox", { name: "이름" })).toBeVisible();
  });

  test("세션이 만료되면 다시 가입 화면으로 돌아온다", async ({ page }) => {
    // 토큰은 남았는데 서버가 모르는 상태다. 그대로 두면 빈 홈에 갇힌다.
    await openApp(page, "/", { tasks: null });

    await expect(page.getByRole("textbox", { name: "이름" })).toBeVisible();
  });

  test.describe("날짜 입력", () => {
    test.beforeEach(async ({ page }) => {
      await openApp(page, "/signup", { signedIn: false });
      await expect(page.getByRole("textbox", { name: "이름" })).toBeVisible();
    });

    test("다 적기 전에는 나무라지 않는다", async ({ page }) => {
      // 년을 두 자리 적은 중간 상태를 틀렸다고 하면, 적는 내내 빨간 글씨를 보게 된다.
      await page.getByRole("textbox", { name: /생일 년/ }).fill("19");

      const text = (await page.locator("body").textContent()) ?? "";
      expect(text).not.toContain("입력해 주세요.");
    });

    test("있을 수 없는 해를 적으면 범위를 알린다", async ({ page }) => {
      // 키보드로 바꾸면서 없던 문제가 생겼다. 고르는 방식에서는 3000년을 고를 수 없었다.
      await page.getByRole("textbox", { name: /생일 년/ }).fill("3000");
      await page.getByRole("textbox", { name: /생일 월/ }).fill("5");
      await page.getByRole("textbox", { name: /생일 일/ }).fill("5");

      await expect(page.getByText(/사이로 입력해 주세요\./)).toBeVisible();
    });

    test("달력에 없는 날을 적으면 그렇다고 알린다", async ({ page }) => {
      await page.getByRole("textbox", { name: /생일 년/ }).fill("1980");
      await page.getByRole("textbox", { name: /생일 월/ }).fill("2");
      await page.getByRole("textbox", { name: /생일 일/ }).fill("30");

      await expect(page.getByText("실제로 있는 날짜를 입력해 주세요.")).toBeVisible();
    });

    test("제대로 적으면 아무 말도 하지 않는다", async ({ page }) => {
      await page.getByRole("textbox", { name: /생일 년/ }).fill("1980");
      await page.getByRole("textbox", { name: /생일 월/ }).fill("2");
      await page.getByRole("textbox", { name: /생일 일/ }).fill("29");

      const text = (await page.locator("body").textContent()) ?? "";
      expect(text).not.toContain("입력해 주세요.");
    });
  });
});
