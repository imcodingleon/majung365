// 지도 탭 — 센터 찾기 (§5.4).
import { expect, test, type Page } from "@playwright/test";

import { openApp } from "./support/app";

const CENTERS = [
  {
    id: "c1",
    name: "서울동부지부",
    category: "법무보호공단",
    hours: "평일 09:00 - 18:00",
    phone: "02-000-0000",
    tags: ["서울"],
    lat: 37.55,
    lng: 127.05,
  },
  {
    id: "c2",
    name: "서울동부지부 숙식지원",
    category: "법무보호공단",
    hours: "평일 09:00 - 18:00",
    phone: "02-000-0001",
    tags: ["서울"],
    lat: 37.56,
    lng: 127.06,
  },
  {
    id: "c3",
    name: "강남구 정신건강복지센터",
    category: "정신건강복지센터",
    hours: "평일 09:00 - 18:00",
    phone: "02-000-0002",
    tags: ["서울"],
    lat: 37.5,
    lng: 127.03,
  },
];

/** 위치를 모르는 상태에서 시작해 지역을 골라 지도까지 들어간다. */
async function enterMap(page: Page) {
  await expect(page.getByText("시/도 선택")).toBeVisible();
  await page.getByRole("button", { name: "서울", exact: true }).click();
  await page.getByRole("button", { name: "선택 완료" }).click();
  await expect(page.getByText("센터 위치 정보")).toBeVisible();
}

test.describe("지도", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, "/map", { freezeClock: false, centers: CENTERS });
    await enterMap(page);
  });

  test("어느 지역을 보고 있는지 제목 옆에 붙인다", async ({ page }) => {
    // **위치를 잘못 잡았을 때 목록만 보고는 알 수 없다.** 그러면 엉뚱한 동네의
    // 기관에 전화를 건다 (2026-08-31 시안).
    await expect(page.getByText("서울", { exact: true }).first()).toBeVisible();
  });

  test("지역을 다시 고를 길이 있다", async ({ page }) => {
    await page.getByRole("button", { name: "지역 변경" }).click();

    await expect(page.getByText("시/도 선택")).toBeVisible();
  });

  test("지역 변경을 그만두면 지도로 돌아간다", async ({ page }) => {
    // **들어왔다가 나갈 길이 없었다.** 마음이 바뀌어도 시·도를 하나 골라야만 지도로
    // 돌아올 수 있었고, 그러면 보고 있던 지역이 엉뚱하게 바뀐다.
    await page.getByRole("button", { name: "지역 변경" }).click();
    await expect(page.getByText("시/도 선택")).toBeVisible();

    await page.getByRole("button", { name: "이전", exact: true }).click();

    await expect(page.getByText("센터 위치 정보")).toBeVisible();
    await expect(page.getByText("서울", { exact: true }).first()).toBeVisible();
  });

  test("갈래별로 묶어서 낸다", async ({ page }) => {
    // 한 줄로 늘어놓으면 지금 보는 카드가 어느 기관인지 이름을 읽어야 안다.
    await expect(page.getByText("법무보호공단").first()).toBeVisible();
    await expect(page.getByText("2곳")).toBeVisible();
    await expect(page.getByText("1곳")).toBeVisible();
  });

  test("기관마다 갈 수 있는 길을 함께 낸다", async ({ page }) => {
    await expect(page.getByText("서울동부지부", { exact: true })).toBeVisible();
    await expect(page.getByText("운영시간 평일 09:00 - 18:00").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "서울동부지부에 전화" })).toBeVisible();
    await expect(page.getByRole("button", { name: "서울동부지부 길찾기" })).toBeVisible();
  });

  test("갈래를 고르면 그것만 남는다", async ({ page }) => {
    await page.getByRole("button", { name: "정신건강복지센터" }).first().click();

    await expect(page.getByText("강남구 정신건강복지센터")).toBeVisible();
    await expect(page.getByText("서울동부지부", { exact: true })).toBeHidden();
  });

  test("이름으로 찾을 수 있다", async ({ page }) => {
    await page.getByRole("textbox", { name: /찾으려는 센터/ }).fill("숙식");

    await expect(page.getByText("서울동부지부 숙식지원")).toBeVisible();
    await expect(page.getByText("강남구 정신건강복지센터")).toBeHidden();
  });
});

test.describe("지도 — 기관이 없을 때", () => {
  test("없으면 없다고 말한다", async ({ page }) => {
    // **없는 기관을 있는 것처럼 보여주지 않는다.** 그것을 보고 찾아가면 헛걸음이다.
    await openApp(page, "/map", { freezeClock: false, centers: [] });
    await enterMap(page);

    await expect(page.getByText("조건에 맞는 센터가 없어요.")).toBeVisible();
  });
});

// 동까지 고르면 거리를 잰다 (2026-08-26 결정 F-1 · §5.4).
//
// **지역을 직접 고른 사람에게는 거리가 없었다.** 시군구까지만 아는 서버가 그 동네
// 기관들의 한가운데로 거리를 쟀고, 넓은 시에서는 그 한가운데가 엉뚱한 곳을 가리켰다.
test.describe("지도 — 직접 고른 지역의 거리", () => {
  // 산본1동 대표 좌표는 [126.94, 37.37]이다. 여기서 경도로 0.01도면 약 900m다.
  const GUNPO = [
    {
      id: "g1",
      name: "군포지부",
      category: "법무보호공단",
      hours: "평일 09:00 - 18:00",
      phone: "031-000-0000",
      tags: ["경기"],
      lat: 37.3729,
      lng: 126.9503,
    },
  ];

  /** 거리 배지. **정확한 숫자가 아니라 형태로 본다** — 경계를 단순화한 오차가 약 44m라
      반올림 경계를 넘나든다. */
  const DISTANCE = /^(\d+m|\d+(\.\d)?km)$/;

  test("동까지 고르면 거리가 나온다", async ({ page }) => {
    await openApp(page, "/map", { freezeClock: false, centers: GUNPO });

    await expect(page.getByText("시/도 선택")).toBeVisible();
    await page.getByRole("button", { name: "경기", exact: true }).click();
    await page.getByRole("button", { name: "군포시", exact: true }).click();
    await page.getByRole("button", { name: "산본1동", exact: true }).click();
    await page.getByRole("button", { name: "선택 완료" }).click();

    await expect(page.getByText("군포시 산본1동")).toBeVisible();
    await expect(page.getByText(DISTANCE).first()).toBeVisible();
  });

  test("고른 동 이름을 서버에 함께 보낸다", async ({ page }) => {
    // **좌표만으로는 자기 동 센터가 잘린다.** 기관 데이터의 좌표가 자기 동 밖에 찍힌
    // 곳이 93곳이고, 안양 호계3동은 호계1동과 좌표가 같다. 서버가 이름으로도 짚을 수
    // 있게 함께 보내야 하는데, **한쪽만 고치면 아무 오류 없이 예전처럼 동작한다.**
    const asked: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/centers")) asked.push(req.url());
    });

    await openApp(page, "/map", { freezeClock: false, centers: GUNPO });

    await expect(page.getByText("시/도 선택")).toBeVisible();
    await page.getByRole("button", { name: "경기", exact: true }).click();
    await page.getByRole("button", { name: "군포시", exact: true }).click();
    await page.getByRole("button", { name: "산본1동", exact: true }).click();
    await page.getByRole("button", { name: "선택 완료" }).click();
    await expect(page.getByText("군포시 산본1동")).toBeVisible();

    const last = asked.at(-1) ?? "";
    expect(decodeURIComponent(last)).toContain("dong=산본1동");
  });

  test("시·도만 고르면 거리를 지어내지 않는다", async ({ page }) => {
    // **좌표가 없으면 카드가 배지를 아예 안 그린다.** 모르는 것을 아는 척하지 않는다.
    await openApp(page, "/map", { freezeClock: false, centers: GUNPO });

    await expect(page.getByText("시/도 선택")).toBeVisible();
    await page.getByRole("button", { name: "경기", exact: true }).click();
    await page.getByRole("button", { name: "선택 완료" }).click();

    await expect(page.getByText("군포지부")).toBeVisible();
    await expect(page.getByText(DISTANCE)).toHaveCount(0);
  });
});
