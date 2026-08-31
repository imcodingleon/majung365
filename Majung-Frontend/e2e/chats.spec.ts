// 채팅 내역 화면 (§6·§7.3).
import { expect, test } from "@playwright/test";

import { openApp } from "./support/app";
import { roomsFixture, visitsFixture } from "./support/fixtures";

test.describe("채팅 내역 — 비어 있을 때", () => {
  test("무엇을 하면 이곳이 채워지는지 알린다", async ({ page }) => {
    await openApp(page, "/chats", { visits: [], chatRooms: [] });

    await expect(page.getByText("채팅 내역이 없습니다.")).toBeVisible();
    await expect(page.getByText("궁금한 점이나 필요한 도움이 있다면")).toBeVisible();
  });

  test("제목이 가운데에 온다", async ({ page }) => {
    await openApp(page, "/chats", { visits: [], chatRooms: [] });

    const title = page.getByRole("heading", { name: "채팅 내역" });
    await expect(title).toBeVisible();
    const box = await title.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.x + box!.width / 2 - 220)).toBeLessThan(12);
  });
});

test.describe("채팅 내역 — 대화가 쌓였을 때", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, "/chats", { visits: visitsFixture(), chatRooms: roomsFixture() });
  });

  test("담당자와 마중365를 묶어서 낸다", async ({ page }) => {
    // 아이콘만으로는 갈리지 않아 묶음 제목으로 나눈다 (2026-08-26 결정 H-3).
    await expect(page.getByText("담당자와 나눈 이야기")).toBeVisible();
    await expect(page.getByText("마중365에게 물어본 것")).toBeVisible();
  });

  test("오늘 나눈 이야기는 시각으로 낸다", async ({ page }) => {
    await expect(page.getByText("오전 08:30")).toBeVisible();
    await expect(page.getByText("오전 08:48")).toBeVisible();
  });

  test("지난 이야기는 날짜로 낸다", async ({ page }) => {
    // **시각만 내면 지난 것이 오늘 일로 읽힌다.** 닷새 전 대화가 "오전 09:00"으로
    // 떠서 오늘 아침 것과 구별되지 않았다.
    await expect(page.getByText("어제").first()).toBeVisible();
    await expect(page.getByText("8월 26일")).toBeVisible();
  });

  test("안 읽은 개수를 줄 오른쪽에 낸다", async ({ page }) => {
    const row = page.getByRole("button", { name: /박지훈 주무관/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("3", { exact: true })).toBeVisible();
  });

  test("최근에 말한 것이 위로 온다", async ({ page }) => {
    await expect(page.getByText("네, 그때 뵙겠습니다. 신분증만 챙겨 오세요.")).toBeVisible();
    const text = (await page.locator("body").textContent()) ?? "";

    // 담당자 묶음: 30분 전 → 2시간 전 → 어제
    expect(text.indexOf("박지훈 주무관")).toBeLessThan(text.indexOf("김서연"));
    // 마중365 묶음: 12분 전 → 5시간 전 → 어제 → 닷새 전
    expect(text.indexOf("출소증명서는 교정시설에서")).toBeLessThan(
      text.indexOf("긴급지원은 공단 지부에서"),
    );
    expect(text.indexOf("신분증은 행정복지센터에서")).toBeLessThan(
      text.indexOf("생계급여는 주소지 관할에서"),
    );
  });

  test("담당자가 확인하기 전 요청은 목록에 내지 않는다", async ({ page }) => {
    // 취소된 요청은 방이 닫혀 있다 (§7.3-4). 열어도 볼 것이 없는 줄을 만들지 않는다.
    const text = (await page.locator("body").textContent()) ?? "";
    expect(text).not.toContain("그날은 담당자가 자리를 비웁니다.");
  });
});
