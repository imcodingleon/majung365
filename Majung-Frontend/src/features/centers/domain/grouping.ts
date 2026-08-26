// 지도 목록을 갈래로 묶고 거리를 붙인다 (2026-08-26 결정 G-4).
//
// **한 줄로 늘어놓으면 무엇이 무엇인지 안 갈린다.** 공단 지부와 주민센터와
// 정신건강복지센터가 "센터 위치 정보" 아래 섞여 있어, 지금 보는 카드가 어느 기관인지
// 이름을 읽어야만 알 수 있었다.
//
// **거리도 함께 낸다.** 서버가 가까운 순으로 보내지만 얼마나 가까운지는 말하지 않는다.
// 지방에서는 가장 가까운 공단이 50km일 수 있고, 그때는 전화로 먼저 물어보는 편이 낫다.
// 숫자가 있어야 사용자가 그 판단을 한다.
//
// 이 파일은 계산만 한다. 화면도 서버 호출도 없다.
import type { Center } from "@/shared/types";

/** 지금 있는 자리. 지역을 직접 골랐으면 없다. */
export type Origin = { lat: number; lng: number };

/**
 * 갈래를 내는 순서.
 *
 * **칩과 같은 순서다.** 위쪽 칩은 이 순서로 늘어서는데 목록이 다른 순서로 묶이면,
 * 사용자가 칩을 눌러 확인한 순서와 눈으로 훑는 순서가 어긋난다.
 */
const CATEGORY_ORDER = ["법무보호공단", "주민센터", "정신건강복지센터"] as const;

export type CenterGroup = {
  category: string;
  items: readonly Center[];
};

/**
 * 두 지점의 대략적인 거리(km).
 *
 * **정확한 거리가 필요한 자리가 아니다.** 얼마나 먼지 감을 주면 되므로, 위도에 따라
 * 좁아지는 경도를 코사인으로 보정하는 정도로 충분하다. 서버도 같은 방식으로 잰다.
 */
export function distanceKm(from: Origin, to: { lat: number; lng: number }): number {
  const midLat = (((from.lat + to.lat) / 2) * Math.PI) / 180;
  const dx = (from.lng - to.lng) * Math.cos(midLat);
  const dy = from.lat - to.lat;
  return Math.sqrt(dx * dx + dy * dy) * 111;
}

/**
 * 화면에 읽히는 거리. 자리를 모르면 빈 문자열이다.
 *
 * **1km 아래는 미터로 낸다.** "0.3km"보다 "300m"가 걸어갈 만한 거리로 읽힌다.
 * 10km 위로는 소수점을 버린다 — 그 거리에서 100m 차이는 뜻이 없고 숫자만 길어진다.
 */
export function distanceLabel(from: Origin | null, to: { lat: number; lng: number }): string {
  if (!from) return "";
  const km = distanceKm(from, to);
  if (!Number.isFinite(km)) return "";
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)}m`;
  if (km < 10) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
}

/**
 * 갈래별로 묶는다. **묶음 안의 순서는 건드리지 않는다.**
 *
 * 서버가 가까운 순으로 보낸 것을 화면이 다시 줄 세우면 같은 규칙이 두 곳에 생기고,
 * 한쪽만 고쳤을 때 목록과 지도가 어긋난다.
 *
 * 비어 있는 갈래는 내지 않는다 — 제목만 있고 아래가 빈 자리는 "불러오지 못했나"로
 * 읽힌다. 모르는 갈래가 와도 버리지 않고 뒤에 붙인다.
 */
export function groupByCategory(centers: readonly Center[]): CenterGroup[] {
  const buckets = new Map<string, Center[]>();
  for (const c of centers) {
    const found = buckets.get(c.category);
    if (found) found.push(c);
    else buckets.set(c.category, [c]);
  }

  const groups: CenterGroup[] = [];
  for (const category of CATEGORY_ORDER) {
    const items = buckets.get(category);
    if (items?.length) {
      groups.push({ category, items });
      buckets.delete(category);
    }
  }
  // 우리가 모르는 갈래가 새로 생겨도 화면에서 사라지지 않게 한다.
  for (const [category, items] of buckets) {
    if (items.length) groups.push({ category, items });
  }
  return groups;
}
