// 담당자 방문 예약 (§7.1·§7.2).
import { expect, test, type Page } from "@playwright/test";

import { openApp } from "./support/app";

/**
 * 시트에서 월·일·시를 차례로 고른다.
 *
 * **날짜를 못 박지 않고 고를 수 있는 첫 값을 잡는다.** 특정 날짜를 적으면 그날이
 * 지나는 순간 고를 수 없는 값이 되어, 시간이 흐르는 것만으로 검증이 무너진다.
 * 고를 수 없는 줄은 화면에 남아 있으므로(`aria-disabled`) 그것만 걸러낸다.
 */
async function pickWhen(page: Page) {
  for (const opener of [/월 고르기/, /일 고르기/, /시 고르기/]) {
    await page.getByRole("button", { name: opener }).click();
    const pick = page.locator('[role="radio"]:not([aria-disabled="true"])').first();
    await expect(pick).toBeVisible();
    await pick.click();
  }
}

test.describe("방문 예약", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, "/today", { visits: [], freezeClock: false });
    await expect(page.getByText("오늘의 할 일")).toBeVisible();
  });

  test("보내고 나면 카드에 받았다는 표시가 남는다", async ({ page }) => {
    // **보내고 아무 변화가 없으면 갔는지 안 갔는지 알 수 없다.** 그러면 같은 요청을
    // 여러 번 보내게 되고, 담당자 쪽에는 같은 사람의 요청이 쌓인다 (§7.5).
    await page.getByRole("button", { name: /방문 예약하기/ }).first().click();
    // 시트가 열린 것은 그 안의 칸으로 확인한다. "방문 예약하기"는 시트 제목과
    // 카드의 버튼 양쪽에 있어 어느 쪽인지 가려지지 않는다.
    await expect(page.getByRole("button", { name: /월 고르기/ })).toBeVisible();

    await pickWhen(page);
    await page.getByRole("button", { name: "알림 보내기" }).click();

    await expect(page.getByText("신청이 접수됐어요.")).toBeVisible();
    await expect(page.getByText("처리되면 알림으로 알려드릴게요.")).toBeVisible();
  });

  test("보낸 뒤에는 예약 버튼이 사라진다", async ({ page }) => {
    // 같은 할 일로 또 보내지 못하게 한다. 버튼이 남아 있으면 눌러 보게 된다.
    await page.getByRole("button", { name: /방문 예약하기/ }).first().click();
    await pickWhen(page);
    await page.getByRole("button", { name: "알림 보내기" }).click();

    await expect(page.getByText("신청이 접수됐어요.")).toBeVisible();
    await expect(page.getByRole("button", { name: /방문 예약하기/ })).toBeHidden();
  });

  test("보낸 요청을 물릴 길이 있다", async ({ page }) => {
    // 못 가게 되는 일은 실제로 생긴다. 물릴 길이 없으면 담당자가 헛되이 기다린다.
    await page.getByRole("button", { name: /방문 예약하기/ }).first().click();
    await pickWhen(page);
    await page.getByRole("button", { name: "알림 보내기" }).click();

    await expect(page.getByRole("button", { name: /취소/ })).toBeVisible();
  });

  test("때를 고르지 않으면 보내지 못한다", async ({ page }) => {
    await page.getByRole("button", { name: /방문 예약하기/ }).first().click();
    await expect(page.getByRole("button", { name: "알림 보내기" })).toBeDisabled();
  });

  test("보내기 전에 무엇이 정해지는 것이 아닌지 알린다", async ({ page }) => {
    // **예약이 잡힌 줄 알고 그날 찾아가는 것이 실제 위험이다.** 담당자가 확인해야
    // 시간이 정해진다 (§7.1).
    await page.getByRole("button", { name: /방문 예약하기/ }).first().click();
    await expect(
      page.getByText("예약을 확정하는 것이 아니며, 담당자가 확인 후 연락드립니다."),
    ).toBeVisible();
  });

  test("적은 것이 밖으로 나가지 않는다고 알린다", async ({ page }) => {
    // 출소 사실이 드러나는 것이 이 서비스에서 가장 큰 두려움이다. 적기 전에 안심시킨다.
    await page.getByRole("button", { name: /방문 예약하기/ }).first().click();
    await expect(page.getByText("안심하고 알려주세요")).toBeVisible();
    await expect(page.getByText(/다른 곳에 사용되거나 공유되지 않아요/)).toBeVisible();
  });
});
