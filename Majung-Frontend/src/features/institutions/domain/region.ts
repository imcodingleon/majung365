// 지역 선택 (§5.4).
//
// **시군구만 알면 정확한 지부와 센터를 짚어줄 수 있다.** 지부는 광역 단위이고
// 정신건강복지센터는 애초에 시군구 단위 기관이다.
//
// 여기에 동을 더한 것은 거리 때문이다. 시군구까지만 아는 서버는 그 동네 기관들의
// 한가운데로 거리를 재는데, 넓은 시에서는 그 한가운데가 엉뚱한 곳을 가리킨다
// (2026-08-26 결정 F-1). 동을 고르면 그 동의 대표 좌표를 함께 실어 그 문제를 없앤다.
//
// **경계 데이터는 `locate.ts`가 배럴이 아니라 직접 가리켜 가져온다.** 배럴
// (`@/shared/location`)은 `useRegionLookup`을 재수출하고 그것이 이 파일을 도로
// 가져오므로, 배럴을 쓰면 순환이 생긴다.
import { dongCenter, dongsOf } from "@/shared/location/locate";

import regionsData from "../data/regions.json";

export type Region = {
  /** 광역시도 짧은 이름. "서울" · "경기" */
  sido: string;
  /** 그 광역에서 고를 수 있는 시군구. 센터가 있는 곳만 담긴다. */
  districts: readonly string[];
};

export const REGIONS: readonly Region[] = regionsData.regions;

/** 지역을 아직 못 정했으면 null. 시군구를 모르면 sido만 채워진다. */
export type SelectedRegion = {
  /** 짧은 이름. **서버 계약이 이 표기다.** */
  sido: string;
  /** 센터가 없는 지역이거나 시군구를 모르면 null. 이때는 광역 지부만 안내한다. */
  district: string | null;
  /**
   * 고른 행정동. 안 골랐으면 null.
   *
   * **선택 항목으로 두지 않는다.** 필수로 두어야 타입 검사가 이 값을 만드는 자리를
   * 빠짐없이 짚어 준다.
   */
  dong: string | null;
  /**
   * 고른 동의 대표 좌표.
   *
   * **짝으로만 담는다** — 하나만 있으면 없는 것으로 친다. 반쪽 좌표로 거리를 재면
   * 엉뚱한 곳이 나온다.
   */
  lat?: number;
  lng?: number;
};

export function districtsOf(sido: string): readonly string[] {
  return REGIONS.find((r) => r.sido === sido)?.districts ?? [];
}

/**
 * 고른 지역을 좌표까지 채워 낸다.
 *
 * **누를 때 한 번만 부른다.** 렌더 중에 부르면 그릴 때마다 경계 데이터를 훑는다.
 *
 * 시군구까지만 골랐으면 좌표를 싣지 않는다. 서버가 이미 그 시군구의 한가운데로 같은
 * 계산을 하고 있어 두 값이 어긋날 수 있고, 시 한가운데에서 잰 거리를 화면에 띄우면
 * 사용자는 그것을 자기 자리 기준으로 읽는다. **거리가 뜬다는 것이 "동까지 알려주셨다"는
 * 신호가 되는 편이 정직하다.**
 */
export function selectRegion(
  sido: string,
  district: string | null,
  dong: string | null,
): SelectedRegion {
  if (!district || !dong) return { sido, district, dong: dong ?? null };

  const center = dongCenter(sido, district, dong);
  if (!center) return { sido, district, dong };

  const [lng, lat] = center;
  return { sido, district, dong, lat, lng };
}

/** 검색 결과 한 줄. */
export type RegionHit = {
  kind: "sido" | "district" | "dong";
  /** 크게 낼 이름. "군포시" · "산본1동" */
  label: string;
  /** 어디에 있는 곳인지. "경기" · "경기 군포시". 시도 결과에서는 빈 문자열이다. */
  parent: string;
  sido: string;
  district: string | null;
  dong: string | null;
};

/** 결과 상한. 440px 화면에서 서른 줄이면 이미 훑기 버겁다. */
const MAX_HITS = 30;

/**
 * 시도와 시군구. 늘 들고 있어도 247개뿐이라 부담이 없다.
 */
const SHALLOW: readonly RegionHit[] = REGIONS.flatMap((r) => [
  { kind: "sido" as const, label: r.sido, parent: "", sido: r.sido, district: null, dong: null },
  ...r.districts.map((d) => ({
    kind: "district" as const,
    label: d,
    parent: r.sido,
    sido: r.sido,
    district: d,
    dong: null,
  })),
]);

/**
 * 행정동 3,495개. **첫 검색 때 한 번만 만든다.**
 *
 * 컴포넌트가 아니라 모듈이 들고 있어야 지역 선택 화면을 여닫을 때마다 다시 만들지
 * 않는다. 애플리케이션 상태가 아니라 바뀌지 않는 데이터에서 뽑아낸 상수다.
 */
let deepIndex: readonly RegionHit[] | null = null;

function deep(): readonly RegionHit[] {
  if (deepIndex) return deepIndex;
  const hits: RegionHit[] = [];
  for (const region of REGIONS) {
    for (const district of region.districts) {
      for (const dong of dongsOf(region.sido, district)) {
        hits.push({
          kind: "dong",
          label: dong,
          parent: `${region.sido} ${district}`,
          sido: region.sido,
          district,
          dong,
        });
      }
    }
  }
  deepIndex = hits;
  return hits;
}

/** 갈래 순서. 시도가 가장 위, 동이 가장 아래다. */
const ORDER: Record<RegionHit["kind"], number> = { sido: 0, district: 1, dong: 2 };

/**
 * 어느 단계에 있든 같은 답을 낸다.
 *
 * **"군포"가 안 나오던 자리다.** 예전에는 시도만 걸렀는데, "군포"는 어느 시도 이름과도
 * 맞지 않아 화면이 통째로 비었다. 데이터가 없던 것이 아니라 설계대로 동작한 것이다.
 *
 * 한 글자일 때 동을 빼는 방법은 쓰지 않는다. 3,495개를 훑는 비용이 문제가 아니라
 * **결과 개수가 문제**이고("동"이 2,187건이다), 한 글자를 막아도 두 글자 "중앙"이
 * 서른 건을 넘으므로 층을 자르는 규칙으로는 못 막는다. 대신 순서와 상한으로 다스린다.
 *
 * 같은 갈래 안에서는 **앞에서부터 맞는 것을 먼저** 올린다. "군포"를 치면 사용자가
 * 실패했던 바로 그 "군포시"가 맨 위에 온다.
 */
export function searchRegions(keyword: string): readonly RegionHit[] {
  const word = keyword.trim();
  if (word === "") return [];

  const hits = [...SHALLOW, ...deep()].filter((h) => h.label.includes(word));
  return hits
    .sort((a, b) => {
      const byKind = ORDER[a.kind] - ORDER[b.kind];
      if (byKind !== 0) return byKind;
      const byHead = Number(b.label.startsWith(word)) - Number(a.label.startsWith(word));
      if (byHead !== 0) return byHead;
      return a.label.length - b.label.length;
    })
    .slice(0, MAX_HITS);
}

/** 결과를 잘라 냈는지. 화면이 "더 자세히 입력해 주세요"를 낼지 정하는 데 쓴다. */
export function hasMoreThanShown(keyword: string): boolean {
  const word = keyword.trim();
  if (word === "") return false;
  let count = 0;
  for (const hit of [...SHALLOW, ...deep()]) {
    if (hit.label.includes(word) && ++count > MAX_HITS) return true;
  }
  return false;
}
