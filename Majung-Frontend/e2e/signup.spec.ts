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
      await page.getByRole("textbox", { name: /생년월일 년/ }).fill("19");

      const text = (await page.locator("body").textContent()) ?? "";
      expect(text).not.toContain("입력해 주세요.");
    });

    test("있을 수 없는 해를 적으면 범위를 알린다", async ({ page }) => {
      // 키보드로 바꾸면서 없던 문제가 생겼다. 고르는 방식에서는 3000년을 고를 수 없었다.
      await page.getByRole("textbox", { name: /생년월일 년/ }).fill("3000");
      await page.getByRole("textbox", { name: /생년월일 월/ }).fill("5");
      await page.getByRole("textbox", { name: /생년월일 일/ }).fill("5");

      await expect(page.getByText(/사이로 입력해 주세요\./)).toBeVisible();
    });

    test("달력에 없는 날을 적으면 그렇다고 알린다", async ({ page }) => {
      await page.getByRole("textbox", { name: /생년월일 년/ }).fill("1980");
      await page.getByRole("textbox", { name: /생년월일 월/ }).fill("2");
      await page.getByRole("textbox", { name: /생년월일 일/ }).fill("30");

      await expect(page.getByText("실제로 있는 날짜를 입력해 주세요.")).toBeVisible();
    });

    test("제대로 적으면 아무 말도 하지 않는다", async ({ page }) => {
      await page.getByRole("textbox", { name: /생년월일 년/ }).fill("1980");
      await page.getByRole("textbox", { name: /생년월일 월/ }).fill("2");
      await page.getByRole("textbox", { name: /생년월일 일/ }).fill("29");

      const text = (await page.locator("body").textContent()) ?? "";
      expect(text).not.toContain("입력해 주세요.");
    });
  });
});

// 6분야 격자가 좁은 화면에서 무너지지 않는가 (2026-08-31).
//
// **체크 동그라미가 카드 밖으로 삐져나갔다.** 라벨 칸에 `flex-1`이 없어 글자 길이만큼
// 벌어지면서 오른쪽 동그라미를 밀어냈다. 여섯 자인 "생계·긴급비용"과 "기타·권리구제"
// 둘만 그랬고, 폰에서 카드 경계를 넘어 나갔다.
//
// **기본 뷰포트(440px)로는 못 잡는다.** 그 폭에서는 라벨이 한 줄에 들어가 넘치지
// 않는다. 실제로 막힌 것은 폰이었다.
test.describe("가입 — 좁은 화면의 6분야 격자", () => {
  // 갤럭시 계열의 흔한 폭이다. 카드 하나가 155px까지 좁아진다.
  test.use({ viewport: { width: 360, height: 800 } });

  const LABELS = ["주거", "생계·긴급비용", "신분·행정", "취업·직업", "건강·심리", "기타·권리구제"];

  test("체크 표시가 카드를 넘어가지 않고 여섯 칸 높이가 같다", async ({ page }) => {
    await openApp(page, "/signup", { freezeClock: false });
    await expect(page.getByText("상황 알아보기")).toBeVisible();

    // **눈으로 판단하지 않고 잰다.** 삐져나간 것도 `toBeVisible()`은 통과한다.
    const measured = await page.evaluate((labels) => {
      const rows: { label: string; over: number; height: number }[] = [];
      document.querySelectorAll('[role="button"]').forEach((el) => {
        const text = (el.textContent ?? "").trim();
        const hit = labels.find((l) => text === l || text.startsWith(l));
        if (!hit) return;
        const kids = Array.from(el.children);
        const badge = kids[kids.length - 1];
        if (!badge) return;
        const card = el.getBoundingClientRect();
        const mark = badge.getBoundingClientRect();
        rows.push({ label: hit, over: mark.right - card.right, height: card.height });
      });
      return rows;
    }, LABELS);

    expect(measured).toHaveLength(6);
    for (const box of measured) {
      expect(box.over, `${box.label}의 체크가 카드를 넘어갔다`).toBeLessThanOrEqual(0);
    }
    // 라벨이 두 줄로 접히는 칸만 높아지면 격자가 어긋난다. 자리를 미리 잡아 둔다.
    expect(new Set(measured.map((b) => Math.round(b.height))).size).toBe(1);
  });
});
