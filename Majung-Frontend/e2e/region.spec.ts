// 지역 직접 고르기 (§5.4-5).
//
// **위치를 잡는 쪽은 여기서 보지 않는다.** 이 화면은 자동 감지가 실패했거나 위치를
// 허락하지 않았을 때 나오는 자리이며, 그 판정 자체는 다른 곳의 일이다.
//
// 2026-08-31에 한 화면에 쌓이던 목록을 단계 전환으로 바꿨다. 그래서 "덧붙는다"를
// 확인하던 검증 둘이 "그 자리가 바뀐다"와 "이전으로 되돌아간다"로 바뀌었다.
import { expect, test } from "@playwright/test";

import { openApp } from "./support/app";

test.describe("지역 선택", () => {
  test.beforeEach(async ({ page }) => {
    // 위치가 없으면 지도 탭이 이 화면을 낸다.
    await openApp(page, "/map", { freezeClock: false });
    await expect(page.getByText("시/도 선택")).toBeVisible();
  });

  test("무엇을 하는 곳인지 먼저 알린다", async ({ page }) => {
    await expect(page.getByText("원하시는 지역을 선택하면")).toBeVisible();
  });

  test("고르기 전에는 넘어가지 못한다", async ({ page }) => {
    await expect(page.getByRole("button", { name: "선택 완료" })).toBeDisabled();
  });

  test("돌아갈 자리가 없으면 첫 단계에 이전이 없다", async ({ page }) => {
    // 위치를 못 잡아 이 화면이 처음 뜬 것이다. 뒤에 아무것도 없으므로 눌러도 갈 곳이 없다.
    await expect(page.getByRole("button", { name: "이전", exact: true })).toBeHidden();
  });

  test("시·도를 고르면 그 자리가 시·군·구 목록으로 바뀐다", async ({ page }) => {
    await page.getByRole("button", { name: "서울", exact: true }).click();

    await expect(page.getByText("시/군/구 선택")).toBeVisible();
    await expect(page.getByRole("button", { name: "강남구", exact: true })).toBeVisible();
    // **덧붙는 것이 아니라 바뀐다.** 고른 "서울"은 자취에 남으므로 다른 시·도로 확인한다.
    await expect(page.getByRole("button", { name: "부산", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "선택 완료" })).toBeEnabled();
  });

  test("시·군·구를 안 골라도 넘어갈 수 있다", async ({ page }) => {
    // **센터가 없는 지역이 있다.** 반드시 고르게 하면 막다른 길이 된다.
    await page.getByRole("button", { name: "부산", exact: true }).click();
    await expect(page.getByRole("button", { name: "선택 완료" })).toBeEnabled();
  });

  test("이전을 누르면 한 단계씩 되돌아간다", async ({ page }) => {
    // 저리터러시 전제에서 되돌아갈 길이 보이지 않으면 앱을 껐다 켠다.
    await page.getByRole("button", { name: "서울", exact: true }).click();
    await page.getByRole("button", { name: "강남구", exact: true }).click();
    await expect(page.getByText("동 선택")).toBeVisible();

    await page.getByRole("button", { name: "이전", exact: true }).click();
    await expect(page.getByText("시/군/구 선택")).toBeVisible();

    await page.getByRole("button", { name: "이전", exact: true }).click();
    await expect(page.getByText("시/도 선택")).toBeVisible();
    await expect(page.getByRole("button", { name: "부산", exact: true })).toBeVisible();
  });

  test("이름으로 찾을 수 있다", async ({ page }) => {
    // 시·도가 열일곱이라 눈으로 훑는 것만도 일이다.
    await page.getByRole("textbox", { name: "지역명 검색" }).fill("전");

    await expect(page.getByRole("button", { name: "전남", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "서울", exact: true })).toBeHidden();
  });

  test("어느 단계에 있든 시·군·구와 동까지 찾는다", async ({ page }) => {
    // **"군포"를 쳐도 안 나오던 자리다.** 예전에는 시·도만 걸러서, 어느 시·도 이름과도
    // 맞지 않는 "군포"에는 빈 화면이 나갔다.
    await page.getByRole("textbox", { name: "지역명 검색" }).fill("군포");

    await expect(page.getByRole("button", { name: "경기 군포시", exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "경기 군포시 군포1동", exact: true }),
    ).toBeVisible();
  });

  test("검색 결과를 누르면 단계를 건너뛴다", async ({ page }) => {
    // 되짚게 하지 않는다. 다만 확정은 "선택 완료"가 하므로, 같은 이름의 동이 여럿일 때
    // 어느 것을 골랐는지 자취로 확인할 수 있다.
    await page.getByRole("textbox", { name: "지역명 검색" }).fill("산본1동");
    await page.getByRole("button", { name: "경기 군포시 산본1동", exact: true }).click();

    await expect(page.getByText("동 선택")).toBeVisible();
    await expect(page.getByText("경기 군포시")).toBeVisible();
    await expect(page.getByRole("button", { name: "선택 완료" })).toBeEnabled();
  });
});
