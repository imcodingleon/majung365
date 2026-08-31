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

// 지역을 바꾸면 홈의 "가까운 곳"도 따라간다 (2026-08-31).
//
// **지도에서 지역을 바꿔도 홈은 예전 지역에 머물렀다.** 지도는 자기 훅 인스턴스의 값을
// 보고, 홈은 가입할 때 세션에 박힌 값을 보고 있었다. 새 값은 기기와 서버에만 적히므로
// 어느 쪽도 그것을 몰랐고, 탭은 화면을 살려 두어 되돌아와도 그대로였다 — 새로고침해야
// 맞았다. 그래서 `useRegionLookup`을 화면들이 함께 보는 값으로 올렸다.
test.describe("홈 — 지역을 바꾼 뒤", () => {
  test("가까운 곳을 새 지역으로 다시 부른다", async ({ page }) => {
    const asked: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/district-offices")) asked.push(req.url());
    });

    // **홈을 먼저 띄워 둔다.** 탭이 화면을 살려 두므로, 나중에 돌아와도 다시 마운트되지
    // 않는다. 지도부터 열면 홈이 새로 그려지면서 어차피 새 값을 읽어 결함이 가려진다.
    await openApp(page, "/today", { freezeClock: false });
    await expect(page.getByRole("tab", { name: "지도" })).toBeVisible();

    await page.getByRole("tab", { name: "지도" }).click();
    await expect(page.getByText("시/도 선택")).toBeVisible();
    await page.getByRole("button", { name: "경기", exact: true }).click();
    await page.getByRole("button", { name: "군포시", exact: true }).click();
    await page.getByRole("button", { name: "선택 완료" }).click();
    await expect(page.getByText("군포시")).toBeVisible();

    await page.getByRole("tab", { name: "홈" }).click();

    // 행정복지센터를 안내하는 할 일(R9)을 펼치면 그 지역으로 불러온다.
    await page.getByText("신분증", { exact: true }).first().click();

    await expect
      .poll(() => asked.some((u) => decodeURIComponent(u).includes("sido=경기")))
      .toBe(true);
  });
});
