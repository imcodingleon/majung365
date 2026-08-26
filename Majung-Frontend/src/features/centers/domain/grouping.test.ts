// **전역이 아니라 가져와서 쓴다.** `expo/tsconfig.base`가 `types`를 좁혀 두어
// `describe`·`it`·`expect`가 전역으로 잡히지 않는다.
import { describe, expect, it } from "@jest/globals";

import type { Center } from "@/shared/types";

import { distanceKm, distanceLabel, groupByCategory } from "./grouping";

const GUNPO_STATION = { lat: 37.35617, lng: 126.94834 };

function center(over: Partial<Center> & { id: string; category: string }): Center {
  return {
    name: over.id,
    address: "경기도 군포시",
    phone: "031-000-0000",
    hours: "평일 09:00 - 18:00",
    lat: 37.35617,
    lng: 126.94834,
    tags: [],
    ...over,
  } as Center;
}

describe("groupByCategory — 갈래로 묶기", () => {
  it("칩과 같은 순서로 낸다", () => {
    // 목록이 다른 순서로 묶이면 칩을 눌러 확인한 순서와 눈으로 훑는 순서가 어긋난다.
    const groups = groupByCategory([
      center({ id: "a", category: "주민센터" }),
      center({ id: "b", category: "정신건강복지센터" }),
      center({ id: "c", category: "법무보호공단" }),
    ]);
    expect(groups.map((g) => g.category)).toEqual([
      "법무보호공단",
      "주민센터",
      "정신건강복지센터",
    ]);
  });

  it("묶음 안의 순서는 건드리지 않는다", () => {
    // **서버가 가까운 순으로 보낸다.** 화면이 다시 줄 세우면 규칙이 두 곳에 생긴다.
    const groups = groupByCategory([
      center({ id: "가까움", category: "주민센터" }),
      center({ id: "중간", category: "주민센터" }),
      center({ id: "멂", category: "주민센터" }),
    ]);
    expect(groups[0].items.map((c) => c.id)).toEqual(["가까움", "중간", "멂"]);
  });

  it("비어 있는 갈래는 내지 않는다", () => {
    // 제목만 있고 아래가 빈 자리는 "불러오지 못했나"로 읽힌다.
    const groups = groupByCategory([center({ id: "a", category: "주민센터" })]);
    expect(groups).toHaveLength(1);
  });

  it("모르는 갈래도 버리지 않고 뒤에 붙인다", () => {
    // 서버에 갈래가 새로 생겨도 화면에서 통째로 사라지면 안 된다.
    const groups = groupByCategory([
      center({ id: "새것", category: "고용센터" }),
      center({ id: "a", category: "주민센터" }),
    ]);
    expect(groups.map((g) => g.category)).toEqual(["주민센터", "고용센터"]);
  });

  it("아무것도 없으면 묶음도 없다", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});

describe("distanceLabel — 얼마나 먼지", () => {
  it("자리를 모르면 아무 말도 하지 않는다", () => {
    // **지역을 직접 고른 사용자다.** 모르는 거리를 지어내지 않는다.
    expect(distanceLabel(null, GUNPO_STATION)).toBe("");
  });

  it("1km 아래는 미터로 낸다", () => {
    // "0.3km"보다 "300m"가 걸어갈 만한 거리로 읽힌다.
    const near = { lat: GUNPO_STATION.lat + 0.0027, lng: GUNPO_STATION.lng };
    expect(distanceLabel(GUNPO_STATION, near)).toMatch(/^\d+m$/);
  });

  it("10km 아래는 소수점 한 자리까지", () => {
    const some = { lat: GUNPO_STATION.lat + 0.03, lng: GUNPO_STATION.lng };
    expect(distanceLabel(GUNPO_STATION, some)).toMatch(/^\d\.\dkm$/);
  });

  it("10km 위로는 소수점을 버린다", () => {
    // 그 거리에서 100m 차이는 뜻이 없고 숫자만 길어진다.
    const far = { lat: GUNPO_STATION.lat + 0.5, lng: GUNPO_STATION.lng };
    expect(distanceLabel(GUNPO_STATION, far)).toMatch(/^\d+km$/);
  });

  it("바로 그 자리여도 0m라고 하지 않는다", () => {
    // 위치는 대략적이라 0은 거짓이다. 가장 작은 눈금으로 낸다.
    expect(distanceLabel(GUNPO_STATION, GUNPO_STATION)).toBe("10m");
  });
});

describe("distanceKm — 재는 방식", () => {
  it("위도 1도는 111km 안팎이다", () => {
    const north = { lat: GUNPO_STATION.lat + 1, lng: GUNPO_STATION.lng };
    expect(distanceKm(GUNPO_STATION, north)).toBeCloseTo(111, 0);
  });

  it("경도는 위도만큼 벌어지지 않는다", () => {
    // 북위 37도에서 경도 1도는 약 88km다. 보정하지 않으면 동서 거리가 부풀려진다.
    const east = { lat: GUNPO_STATION.lat, lng: GUNPO_STATION.lng + 1 };
    expect(distanceKm(GUNPO_STATION, east)).toBeLessThan(100);
  });
});
