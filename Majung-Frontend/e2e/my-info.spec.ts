// 내 정보 — 생일 확인과 열람·삭제 (§2.5·§9.4).
import { expect, test, type Page } from "@playwright/test";

import { openApp } from "./support/app";
import { BIRTH } from "./support/fixtures";

/** 생일 세 칸을 채운다. */
async function fillBirth(page: Page, iso: string) {
  const [year, month, day] = iso.split("-");
  await page.getByRole("textbox", { name: "생일 년" }).fill(year);
  await page.getByRole("textbox", { name: "생일 월" }).fill(String(Number(month)));
  await page.getByRole("textbox", { name: "생일 일" }).fill(String(Number(day)));
}

test.describe("내 정보 — 들어가기 전 확인", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, "/my-info", { freezeClock: false });
    await expect(page.getByText("생년월일을 입력해주세요")).toBeVisible();
  });

  test("무엇에 쓰는 값인지 밝힌다", async ({ page }) => {
    // 잠그는 화면이 아니라 본인인지 한 번 보는 자리다.
    await expect(
      page.getByText("입력하신 정보는 본인 확인을 위한 용도로만 사용됩니다."),
    ).toBeVisible();
  });

  test("다 적기 전에는 확인을 누르지 못한다", async ({ page }) => {
    await expect(page.getByRole("button", { name: "확인" })).toBeDisabled();
  });

  test("틀리면 왜 안 되는지 알린다", async ({ page }) => {
    await fillBirth(page, "1990-01-01");
    await page.getByRole("button", { name: "확인" }).click();

    await expect(page.getByText(/가입할 때 등록한 정보와 달라요/)).toBeVisible();
  });

  test("틀린 사람에게 다시 시작할 길을 낸다", async ({ page }) => {
    // **잘못 적은 생일을 고칠 자리가 이 관문 너머에만 있다.** 길이 없으면 갇힌다.
    await fillBirth(page, "1990-01-01");
    await page.getByRole("button", { name: "확인" }).click();

    await expect(page.getByText("모든 정보를 지울까요?")).toBeVisible();
    await expect(page.getByText("삭제한 정보는 다시 복구할 수 없어요.")).toBeVisible();
  });

  test("맞으면 내 정보가 열린다", async ({ page }) => {
    await fillBirth(page, BIRTH);
    await page.getByRole("button", { name: "확인" }).click();

    await expect(page.getByText("정보 보관 안내")).toBeVisible();
  });
});

test.describe("내 정보 — 열람과 삭제", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, "/my-info", { freezeClock: false });
    await expect(page.getByText("생년월일을 입력해주세요")).toBeVisible();
    await fillBirth(page, BIRTH);
    await page.getByRole("button", { name: "확인" }).click();
    await expect(page.getByText("정보 보관 안내")).toBeVisible();
  });

  test("저장된 것을 그대로 보여준다", async ({ page }) => {
    // 저장하는 이상 사용자가 자기 정보를 볼 수 있어야 한다 (§2.5).
    await expect(page.getByText("홍길동")).toBeVisible();
    await expect(page.getByText("1980년 3월 15일")).toBeVisible();
  });

  test("언제까지 보관하는지 알린다", async ({ page }) => {
    await expect(page.getByText(/1년이 지나면 저장된 정보가/)).toBeVisible();
  });

  test("지우기 전에 무엇이 사라지는지 알린다", async ({ page }) => {
    await page.getByRole("button", { name: "모든 정보 삭제" }).first().click();

    await expect(page.getByText("모든 정보를 지울까요?")).toBeVisible();
    await expect(page.getByText("· 지금까지 나눈 대화")).toBeVisible();
    await expect(page.getByText("삭제한 정보는 다시 복구할 수 없어요.")).toBeVisible();
  });

  test("지울지 묻는 자리가 화면을 덮는다", async ({ page }) => {
    // **되돌릴 수 없는 일을 묻는 자리가 눈에 안 들어오면 안 된다** (2026-08-31).
    // 목록 아래에 펼치던 때에는 누른 자리가 화면 끝이라, 카드가 접힌 곳 밖에 서서
    // 아무 일도 안 난 것처럼 보였다.
    await page.getByRole("button", { name: "모든 정보 삭제" }).first().click();

    const card = page.getByText("모든 정보를 지울까요?");
    await expect(card).toBeVisible();

    // 구르지 않아도 카드 전체가 화면 안에 있다.
    const box = await card.boundingBox();
    const view = page.viewportSize();
    expect(box).not.toBeNull();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(view?.height ?? 0);

    // 뒤 화면을 가리는 덮개가 있다. 없으면 목록 위에 카드만 얹힌 것이다.
    const covered = await page.evaluate(() =>
      Array.from(document.querySelectorAll("div")).some((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (
          s.backgroundColor === "rgba(0, 0, 0, 0.5)" &&
          r.width >= window.innerWidth - 1 &&
          r.height >= window.innerHeight - 1
        );
      }),
    );
    expect(covered).toBe(true);
  });

  test("지우다 말 수 있다", async ({ page }) => {
    await page.getByRole("button", { name: "모든 정보 삭제" }).first().click();
    await expect(page.getByText("모든 정보를 지울까요?")).toBeVisible();

    await page.getByRole("button", { name: "취소하기" }).click();
    await expect(page.getByText("모든 정보를 지울까요?")).toBeHidden();
  });
});
