// 경계 데이터 조회 (§5.4).
//
// **여기가 비면 지역을 직접 고른 사람의 길이 막힌다.** 화면은 눈으로 보면 되지만
// "어느 시군구가 동을 못 찾는가"는 화면을 230번 눌러 보기 전에는 드러나지 않는다.
// **전역이 아니라 가져와서 쓴다.** `expo/tsconfig.base`가 `types`를 좁혀 두어
// `describe`·`test`·`expect`가 전역으로 잡히지 않는다.
import { describe, expect, test } from "@jest/globals";

import { REGIONS } from "@/features/institutions/domain/region";

import { dongCenter, dongsOf, shortSido } from "./locate";

describe("dongsOf", () => {
  test("정확히 맞는 시군구의 동을 낸다", () => {
    // 230개 중 218개가 이 경로다.
    const dongs = dongsOf("서울", "송파구");
    expect(dongs).toContain("오금동");
    expect(dongs.length).toBeGreaterThan(20);
  });

  test("군포시의 동 열하나를 낸다", () => {
    // 사용자가 "군포시도 넓어"라고 한 그 자리다.
    const dongs = dongsOf("경기", "군포시");
    expect(dongs).toContain("산본1동");
    expect(dongs).toContain("군포1동");
    expect(dongs).toHaveLength(11);
  });

  test("일반구를 둔 시는 구를 가로질러 모은다", () => {
    // **"수원시"는 경계 데이터에 없다.** 장안·권선·팔달·영통으로 갈려 있다.
    const dongs = dongsOf("경기", "수원시");
    expect(dongs).toContain("파장동"); // 장안구
    expect(dongs).toContain("영통1동"); // 영통구
    expect(dongs.length).toBeGreaterThan(40);
  });

  test("일반구를 가로질러 모아도 동 이름이 겹치지 않는다", () => {
    // 겹치면 `dongCenter`가 엉뚱한 두 폴리곤을 평균 낸다. 일반구 단계를 만들지 않은
    // 근거가 이것이므로 데이터가 바뀌면 여기서 걸려야 한다.
    for (const district of ["수원시", "성남시", "고양시", "용인시"]) {
      const dongs = dongsOf("경기", district);
      expect(new Set(dongs).size).toBe(dongs.length);
    }
  });

  test("표기가 어긋나는 두 곳도 별칭으로 찾는다", () => {
    // 부산 "진구"는 정식 명칭이 "부산진구"이고, 대구 "군위군"은 경계 데이터에서
    // 아직 경북 소속이다. 별칭이 없으면 이 두 곳만 동 단계가 통째로 빈다.
    expect(dongsOf("부산", "진구").length).toBeGreaterThan(0);
    expect(dongsOf("대구", "군위군").length).toBeGreaterThan(0);
  });

  test("없는 시군구는 빈 배열이다", () => {
    expect(dongsOf("경기", "없는시")).toEqual([]);
    expect(dongsOf("없는도", "군포시")).toEqual([]);
  });

  test("긴 시도 이름으로 물어도 같은 답을 낸다", () => {
    expect(dongsOf("경기도", "군포시")).toEqual(dongsOf("경기", "군포시"));
  });

  test("센터가 있는 시군구 230곳이 모두 동을 갖는다", () => {
    // **가장 값진 검증이다.** 경계 데이터나 기관 데이터를 갈아끼울 때 어느 지역이
    // 조용히 막다른 길이 되는지 여기서 즉시 드러난다.
    const empty: string[] = [];
    for (const region of REGIONS) {
      for (const district of region.districts) {
        if (dongsOf(region.sido, district).length === 0) {
          empty.push(`${region.sido} ${district}`);
        }
      }
    }
    expect(empty).toEqual([]);
  });
});

describe("dongCenter", () => {
  test("산본1동의 대표 좌표를 낸다", () => {
    const center = dongCenter("경기", "군포시", "산본1동");
    expect(center).not.toBeNull();
    const [lng, lat] = center as [number, number];
    expect(lng).toBeCloseTo(126.94, 1);
    expect(lat).toBeCloseTo(37.37, 1);
  });

  test("경도가 위도보다 크다", () => {
    // **한국에서는 위도(33~39)가 경도(124~132)보다 작다.** [경도, 위도] 튜플을
    // 뒤집어 쓰면 거리가 통째로 엉키는데, 그것을 잡는 가장 싼 장치다.
    const center = dongCenter("서울", "송파구", "오금동");
    const [lng, lat] = center as [number, number];
    expect(lat).toBeLessThan(lng);
  });

  test("일반구를 가로지른 시에서도 그 동만 짚는다", () => {
    const jangan = dongCenter("경기", "수원시", "파장동");
    const yeongtong = dongCenter("경기", "수원시", "영통1동");
    expect(jangan).not.toBeNull();
    expect(yeongtong).not.toBeNull();
    expect(jangan).not.toEqual(yeongtong);
  });

  test("없는 동은 null이다", () => {
    expect(dongCenter("경기", "군포시", "없는동")).toBeNull();
  });
});

describe("shortSido", () => {
  test("짧은 이름에 다시 걸어도 그대로다", () => {
    // `areasOf`가 긴 이름과 짧은 이름을 함께 받는 근거다.
    for (const region of REGIONS) {
      expect(shortSido(region.sido)).toBe(region.sido);
    }
  });
});
