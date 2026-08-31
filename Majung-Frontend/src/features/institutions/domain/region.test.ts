// 지역 선택 (§5.4).
//
// **화면을 눌러 보는 것으로는 안 드러나는 것들이다.** 좌표를 짝으로만 담았는지,
// "군포"를 쳤을 때 군포시가 맨 위에 오는지는 값을 직접 봐야 안다.
//
// **전역이 아니라 가져와서 쓴다.** `expo/tsconfig.base`가 `types`를 좁혀 두어
// `describe`·`test`·`expect`가 전역으로 잡히지 않는다.
import { describe, expect, test } from "@jest/globals";

import { districtsOf, hasMoreThanShown, searchRegions, selectRegion } from "./region";

describe("selectRegion", () => {
  test("동까지 고르면 좌표를 짝으로 담는다", () => {
    const picked = selectRegion("경기", "군포시", "산본1동");
    expect(picked.dong).toBe("산본1동");
    expect(typeof picked.lat).toBe("number");
    expect(typeof picked.lng).toBe("number");
  });

  test("시군구까지만 골랐으면 좌표 칸이 아예 없다", () => {
    // **서버가 이미 같은 계산을 한다.** 여기서 따로 재면 두 값이 어긋난다.
    const picked = selectRegion("경기", "군포시", null);
    expect(picked).toEqual({ sido: "경기", district: "군포시", dong: null });
    expect("lat" in picked).toBe(false);
    expect("lng" in picked).toBe(false);
  });

  test("시도까지만 골라도 막히지 않는다", () => {
    // 센터가 없는 시군구가 있어서, 반드시 고르게 하면 막다른 길이 된다.
    const picked = selectRegion("서울", null, null);
    expect(picked).toEqual({ sido: "서울", district: null, dong: null });
  });

  test("경계 데이터에 없는 동이면 좌표 없이 낸다", () => {
    const picked = selectRegion("경기", "군포시", "없는동");
    expect(picked.dong).toBe("없는동");
    expect("lat" in picked).toBe(false);
  });

  test("일반구를 둔 시에서도 동 좌표를 찾는다", () => {
    // "수원시"는 경계 데이터에 없고 장안·권선·팔달·영통으로 갈려 있다.
    const picked = selectRegion("경기", "수원시", "파장동");
    expect(typeof picked.lat).toBe("number");
    expect(picked.district).toBe("수원시");
  });
});

describe("searchRegions", () => {
  test("시도를 안 고른 채로 시군구를 찾는다", () => {
    // **사용자가 실패했던 그 질의다.** 예전에는 시도만 걸러 화면이 통째로 비었다.
    const hits = searchRegions("군포");
    expect(hits[0]).toMatchObject({ kind: "district", label: "군포시", sido: "경기" });
  });

  test("동까지 찾는다", () => {
    const hits = searchRegions("산본");
    const dong = hits.find((h) => h.label === "산본1동");
    expect(dong).toMatchObject({ kind: "dong", parent: "경기 군포시", district: "군포시" });
  });

  test("시도가 시군구보다, 시군구가 동보다 위에 온다", () => {
    // 기존 화면 검증이 "전"을 쳐서 전남이 보이는지를 본다. 그 자리가 여기에 걸려 있다.
    const hits = searchRegions("전");
    expect(hits[0]?.kind).toBe("sido");
    expect(hits.slice(0, 3).every((h) => h.kind === "sido")).toBe(true);
    expect(hits.some((h) => h.label === "전남")).toBe(true);
  });

  test("같은 갈래에서는 앞에서부터 맞는 것이 먼저다", () => {
    const hits = searchRegions("중앙").filter((h) => h.kind === "dong");
    const head = hits.findIndex((h) => h.label.startsWith("중앙"));
    const tail = hits.findIndex((h) => !h.label.startsWith("중앙"));
    if (tail !== -1) expect(head).toBeLessThan(tail);
  });

  test("이름이 겹치는 동은 상위 지역으로 가린다", () => {
    // "중앙동"은 전국에 여럿이다. 어느 중앙동인지 모르면 고를 수 없다.
    const hits = searchRegions("중앙동");
    const parents = new Set(hits.map((h) => h.parent));
    expect(parents.size).toBeGreaterThan(1);
  });

  test("결과가 서른을 넘지 않는다", () => {
    expect(searchRegions("동").length).toBeLessThanOrEqual(30);
    expect(hasMoreThanShown("동")).toBe(true);
  });

  test("빈 질의와 못 찾는 질의는 빈 배열이다", () => {
    expect(searchRegions("")).toEqual([]);
    expect(searchRegions("   ")).toEqual([]);
    expect(searchRegions("ㅁㄴㅇㄹ")).toEqual([]);
    expect(hasMoreThanShown("")).toBe(false);
  });
});

describe("districtsOf", () => {
  test("그 시도의 시군구를 낸다", () => {
    expect(districtsOf("경기")).toContain("군포시");
    expect(districtsOf("없는도")).toEqual([]);
  });
});
