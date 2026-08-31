// 알림 화면 (§7.1).
import { expect, test } from "@playwright/test";

import { openApp } from "./support/app";
import { visitsFixture } from "./support/fixtures";

test.describe("알림 — 비어 있을 때", () => {
  test("왜 비어 있는지와 앞으로 무엇이 오는지 알린다", async ({ page }) => {
    await openApp(page, "/alerts", { visits: [] });

    await expect(page.getByText("알림이 없습니다.")).toBeVisible();
    await expect(page.getByText("새로운 소식이 생기면")).toBeVisible();
  });

  test("제목이 가운데에 온다", async ({ page }) => {
    // 2026-08-31 시안. 이 줄에는 제목 말고 아무것도 오지 않으므로 왼쪽에 붙이면
    // 오른쪽이 통째로 빈 자리로 남는다.
    await openApp(page, "/alerts", { visits: [] });

    const title = page.getByRole("heading", { name: "알림" });
    await expect(title).toBeVisible();
    const box = await title.boundingBox();
    expect(box).not.toBeNull();
    const center = box!.x + box!.width / 2;
    // 웹은 `AppFrame`이 화면을 440px에 묶는다. 그 한가운데가 220이다.
    expect(Math.abs(center - 220)).toBeLessThan(12);
  });
});

test.describe("알림 — 소식이 쌓였을 때", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, "/alerts", { visits: visitsFixture() });
  });

  test("네 종류의 소식을 모두 낸다", async ({ page }) => {
    await expect(page.getByText("담당자가 메시지를 보냈어요")).toBeVisible();
    await expect(page.getByText("방문이 확정되었어요")).toBeVisible();
    await expect(page.getByText("담당자가 다른 시간을 이야기했어요")).toBeVisible();
    await expect(page.getByText("방문이 취소되었어요")).toBeVisible();
  });

  test("방금 온 메시지가 오늘 묶음 맨 위에 온다", async ({ page }) => {
    // **여기가 한 번 어긋났던 자리다.** 메시지 알림이 "말이 온 때"가 아니라
    // "요청을 보낸 때"를 쓰고 있어서, 30분 전에 온 답이 이틀 전 날짜 묶음으로
    // 내려가 목록 세 번째에 묻혔다.
    // 목록이 그려진 뒤에 읽는다. `textContent`는 기다려 주지 않아서, 먼저 붙잡지
    // 않으면 아직 빈 화면을 읽는다.
    await expect(page.getByText("담당자가 메시지를 보냈어요")).toBeVisible();
    const text = (await page.locator("body").textContent()) ?? "";

    const today = text.indexOf("오늘");
    const yesterday = text.indexOf("어제");
    const message = text.indexOf("담당자가 메시지를 보냈어요");
    const confirmed = text.indexOf("방문이 확정되었어요");

    expect(today).toBeGreaterThanOrEqual(0);
    expect(message).toBeGreaterThan(today);
    expect(message).toBeLessThan(yesterday);
    // 두 시간 전에 확정된 소식보다 30분 전에 온 말이 먼저다.
    expect(message).toBeLessThan(confirmed);
  });

  test("날짜로 묶어 언제 온 소식인지 가른다", async ({ page }) => {
    await expect(page.getByText("오늘", { exact: true })).toBeVisible();
    await expect(page.getByText("어제", { exact: true })).toBeVisible();
    // 이틀보다 오래된 것은 날짜와 요일로 적는다. 8월 27일은 목요일이다.
    await expect(page.getByText("8월 27일 목요일")).toBeVisible();
  });

  test("확정 소식은 만날 사람과 장소를 함께 알린다", async ({ page }) => {
    // §7.1 — 창구에서 신분이 드러나는 순간이 실질 장벽이고, 그 해법은 시간을 아는
    // 것이 아니라 누구를 찾아가면 되는지 아는 것이다.
    const body = page.getByText("김서연").first();
    await expect(body).toBeVisible();
    await expect(page.getByText("1층 접수창구")).toBeVisible();
  });

  test("취소 소식은 담당자가 쓴 사유를 그대로 낸다", async ({ page }) => {
    await expect(page.getByText("그날은 담당자가 자리를 비웁니다.")).toBeVisible();
  });
});
