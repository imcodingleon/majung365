// 홈 — 오늘의 할 일 (§5).
import { expect, test } from "@playwright/test";

import { openApp } from "./support/app";

test.describe("홈", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, "/today");
  });

  test("이름을 불러 맞이하고 할 일을 늘어놓는다", async ({ page }) => {
    await expect(page.getByText("홍길동님, 어서 오세요.")).toBeVisible();
    await expect(page.getByText("오늘의 할 일")).toBeVisible();

    await expect(page.getByRole("button", { name: /숙식제공/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /신분증/ })).toBeVisible();
  });

  test("몇 개 중 몇 개를 마쳤는지 알린다", async ({ page }) => {
    // 이것이 없으면 목록이 끝이 없어 보인다.
    await expect(page.getByText("4개 중 0개 완료")).toBeVisible();
  });

  test("카드를 열어 보기만 해서는 진행이 오르지 않는다", async ({ page }) => {
    // **여기가 한 번 어긋났던 자리다.** 열려 있는 카드의 순번을 진행도로 그렸더니,
    // 아무것도 끝내지 않고 뒤쪽 카드를 궁금해서 눌러 보기만 해도 막대가 차올랐다.
    await expect(page.getByText("4개 중 0개 완료")).toBeVisible();

    await page.getByRole("button", { name: /생계급여/ }).click();

    // 카드는 열리지만 진행은 그대로다.
    await expect(page.getByText("4개 중 0개 완료")).toBeVisible();
  });

  test("먼저 하면 좋은 항목에 표시를 붙인다", async ({ page }) => {
    // 차단이 아니라 유도다 (§5.2).
    await expect(page.getByText("먼저 할 일").first()).toBeVisible();
  });

  test("도움 연결은 스크롤과 무관하게 늘 닿는다", async ({ page }) => {
    // 할 일 진행과 상관없이 언제든 전화로 갈 수 있어야 한다 (§5.3).
    await expect(page.getByRole("button", { name: /도움이 필요해요/ })).toBeVisible();
  });
});
