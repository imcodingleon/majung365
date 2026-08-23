// 지역 선택 (§5.4).
//
// **시군구만 알면 정확한 지부와 센터를 짚어줄 수 있다.** 지부는 광역 단위이고
// 정신건강복지센터는 애초에 시군구 단위 기관이다. 웹 검색도 GPS 좌표도 필요 없다.
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
  sido: string;
  /** 센터가 없는 지역이거나 시군구를 모르면 null. 이때는 광역 지부만 안내한다. */
  district: string | null;
};

export function districtsOf(sido: string): readonly string[] {
  return REGIONS.find((r) => r.sido === sido)?.districts ?? [];
}

/**
 * 기기에서 얻은 주소 조각으로 지역을 맞춘다.
 *
 * `reverseGeocodeAsync`가 돌려주는 값은 기기와 지역마다 형태가 다르다. 서울은
 * region="서울특별시" district="송파구"로 오지만, 경기는 city="수원시" district="장안구"로
 * 오기도 한다. **어느 칸에 무엇이 들어올지 정해져 있지 않으므로 후보를 모두 대조한다.**
 */
export function matchRegion(parts: readonly (string | null | undefined)[]): SelectedRegion | null {
  const candidates = parts.filter((p): p is string => Boolean(p && p.trim()));
  if (candidates.length === 0) return null;

  // 광역시도를 먼저 정한다. "서울특별시"처럼 긴 이름으로 오므로 앞부분이 겹치는지 본다.
  const region = REGIONS.find((r) => candidates.some((c) => c.startsWith(r.sido)));
  if (!region) return null;

  // 시군구는 정확히 같은 이름이 있어야 한다. "수원시 장안구"처럼 두 단계로 오면
  // 앞의 시가 우리 목록의 단위다.
  const district =
    region.districts.find((d) => candidates.includes(d)) ??
    region.districts.find((d) => candidates.some((c) => c.split(" ")[0] === d)) ??
    null;

  return { sido: region.sido, district };
}
