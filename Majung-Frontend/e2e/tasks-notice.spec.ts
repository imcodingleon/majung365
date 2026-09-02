// 수용 사유에 따라 달라지는 안내 (§9.4 · 2026-09-02 결정).
//
// **여기 쓰는 가짜 응답은 백엔드가 실제로 조립한 것이다.** `notice-fixture.json`은
// `IntakeUseCase.from_verdicts` → `to_task_out`을 그대로 태워 뽑았다. 손으로 지어낸
// 모양이면 서버가 실제로 무엇을 보내는지와 어긋나도 이 검증이 통과해 버린다.
import { expect, test } from "@playwright/test";

import fixture from "./support/notice-fixture.json";
import { openApp } from "./support/app";

type Tasks = Parameters<typeof openApp>[2] extends { tasks?: infer T } ? T : never;

const CASE = {
  property: fixture.property as unknown as Tasks,
  sexual: fixture.sexual as unknown as Tasks,
  undisclosed: fixture.undisclosed as unknown as Tasks,
};

/** 카드를 열고 안내가 그려질 때까지 기다린다. */
async function openCard(page: import("@playwright/test").Page, label: RegExp) {
  await page.getByRole("button", { name: label }).first().click();
}

/**
 * 안내가 보이는 자리로 스크롤한 뒤 화면을 찍는다.
 *
 * **`fullPage`를 쓰지 않는다.** React Native Web은 자기 스크롤 컨테이너를 두므로
 * 문서 전체를 찍어도 그 안이 펼쳐지지 않고, 스크롤된 위치가 그대로 나온다.
 * 440×900 화면을 찍는 편이 실제 앱에서 보이는 모습에도 가깝다.
 */
async function shoot(
  page: import("@playwright/test").Page,
  anchor: string,
  file: string,
) {
  // **찍을 때만 세로를 늘린다.** 안내가 둘 붙는 항목은 900px에 상자가 다 안 들어가
  // 아래가 잘린다. 폭은 그대로 두므로 줄바꿈은 실제 앱과 같다.
  await page.setViewportSize({ width: 440, height: 1500 });
  await page.getByText(anchor).first().scrollIntoViewIfNeeded();
  // 스크롤이 멎고 그림자·테두리가 자리 잡을 틈을 준다.
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test-results/shots/${file}` });
}

test.describe("수용 사유 안내", () => {
  test("재산·경제범죄 — 통장 카드에 한도제한계좌 안내가 붙는다", async ({ page }) => {
    await openApp(page, "/today", { tasks: CASE.property });
    await openCard(page, /통장/);

    await expect(page.getByText("한도제한계좌 안내")).toBeVisible();
    // **조문 원문이 함께 나간다.** 풀어 쓴 문장만 있으면 우리 해석을 그대로 믿어야 한다.
    await expect(page.getByText(/접근매체를 양도·대여하거나/)).toBeVisible();
    // **"법으로 금지"라고 쓰지 않는다.** 제한 대상은 접근매체를 넘긴 사람이다.
    await expect(page.getByText(/법으로 막히지는 않아요/)).toBeVisible();

    await shoot(page, "한도제한계좌 안내", "01-property-bank.png");
  });

  test("재산·경제범죄 — 빚 문제 카드에 비면책 안내가 붙는다", async ({ page }) => {
    await openApp(page, "/today", { tasks: CASE.property });
    await openCard(page, /개인회생·파산/);

    await expect(page.getByText("파산해도 남는 빚")).toBeVisible();
    await expect(page.getByText(/고의로 가한 불법행위로 인한 손해배상/)).toBeVisible();

    await shoot(page, "파산해도 남는 빚", "02-property-debt.png");
  });

  test("성범죄 — 일자리 카드에 취업제한이 먼저 온다", async ({ page }) => {
    await openApp(page, "/today", { tasks: CASE.sexual });
    await openCard(page, /취업/);

    // **무거운 것부터다.** 법으로 막힌 것이 주의보다 앞선다.
    await expect(page.getByText("아동·청소년 관련 기관 취업 제한")).toBeVisible();
    await expect(page.getByText("경비 일자리 제한")).toBeVisible();

    await shoot(page, "아동·청소년 관련 기관 취업 제한", "03-sexual-job.png");
  });

  test("성범죄 — 주민등록 카드에 경찰서 신고 의무가 붙는다", async ({ page }) => {
    await openApp(page, "/today", { tasks: CASE.sexual });
    await openCard(page, /주민등록/);

    // 지금 앱이 놓치고 있던 자리다. 전입신고만 하면 법을 어기게 된다.
    await expect(page.getByText("경찰서 신고 의무")).toBeVisible();
    await expect(page.getByText(/20일 이내에 관할경찰관서의 장에게/)).toBeVisible();

    await shoot(page, "경찰서 신고 의무", "04-sexual-address.png");
  });

  test("밝히지 않음 — 수용 사유를 언급하지 않는 안내만 나간다", async ({ page }) => {
    await openApp(page, "/today", { tasks: CASE.undisclosed });
    await openCard(page, /취업/);

    // 형을 살았다는 사실에 붙는 제약이라 밝히지 않아도 나간다.
    await expect(page.getByText("경비 일자리 제한")).toBeVisible();
    // **문구가 수용 사유를 언급하지 않는다.** 언급하면 캐묻는 인상이 된다.
    await expect(page.getByText(/수용 사유가/)).toHaveCount(0);

    await shoot(page, "경비 일자리 제한", "05-undisclosed-job.png");
  });

  test("화면 어디에도 금지어를 쓰지 않는다", async ({ page }) => {
    // "죄목"과 "영역"은 화면 금지어다. 안내가 늘어난 만큼 새는 자리도 늘었다.
    await openApp(page, "/today", { tasks: CASE.sexual });
    await openCard(page, /취업/);

    const text = (await page.locator("body").innerText()) ?? "";

    expect(text).not.toContain("죄목");
    expect(text).not.toContain("영역");
  });
});
