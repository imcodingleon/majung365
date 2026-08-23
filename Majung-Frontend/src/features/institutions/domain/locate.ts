// 좌표를 행정동까지 알아낸다. **기기 안에서 끝난다.**
//
// 왜 직접 계산하는가.
//
// **하나. 좌표가 어디로도 나가지 않는다.** §5.4는 "우리 서버로 보내지 않는다"까지만
// 정했는데, 안드로이드의 `Geocoder`는 프레임워크 내장이 아니라 백엔드 서비스에 의존해서
// **역지오코딩 과정에서 좌표가 기기 밖으로 나갈 수 있다**(§12-13 확인 항목).
// 여기서 계산하면 그 경로 자체가 없어진다.
//
// **둘. 웹에서 동작한다.** `expo-location`의 `reverseGeocodeAsync`는 웹 구현이 없어
// 그냥 오류를 던진다. 심사·시연을 웹으로 하면 그 자리에서 기능이 죽는다.
//
// **셋. 시군구로는 부족하다.** 송파구 하나에 주민센터가 27곳이다. 동까지 알아야
// "여기로 가시면 돼요"가 된다.
//
// 데이터는 행정안전부 행정동 경계(2021)다. 원본 30.5MB를 허용 오차 약 44m로 단순화하고
// 좌표를 정수 차이값으로 담아 1.6MB로 줄였다(gzip 543KB). 판정은 100회에 6ms다.
import dongsData from "../data/dongs.json";

/**
 * 위치로 알아낸 곳. **경계 데이터가 준 그대로 담는다.**
 *
 * 서버가 "수원시장안구"처럼 붙여 쓴 표기를 받아 정규화한다. 화면에서 미리 띄우면
 * **변환 규칙이 두 곳에 생기고**, 그 규칙은 "우리 데이터가 어떤 형식인가"에 관한 것이라
 * 데이터를 가진 쪽이 아는 것이 맞다. 사람에게 보일 때만 `districtLabel`로 띄운다.
 */
export type LocatedPlace = {
  /** "서울특별시" */
  sido: string;
  /** "송파구" · "수원시장안구" — 서버에 보낼 때 이 값을 그대로 쓴다. */
  district: string;
  /** "오금동" */
  dong: string;
};

type Area = {
  s: string;
  g: string;
  d: string;
  /** [서, 남, 동, 북]. 대부분의 후보를 좌표 비교 네 번으로 걸러낸다. */
  b: readonly number[];
  /** 고리마다 [x0, y0, dx1, dy1, dx2, dy2, …]. 첫 점만 절대값이고 나머지는 차이다. */
  r: readonly (readonly number[])[];
};

const SCALE = dongsData.scale;
const AREAS = dongsData.areas as readonly Area[];

/**
 * 점이 고리 안에 있는지 (ray casting).
 *
 * 차이값을 더해 가며 판정한다. 고리를 좌표 배열로 펼치면 판정 한 번에 배열 하나를
 * 새로 만들게 되는데, 전국 3,495개 동을 훑는 자리라 그 비용이 쌓인다.
 *
 * 경계선 위의 점은 어느 쪽으로 판정되어도 무방하다. 동 경계에 정확히 선 사람에게
 * 어느 쪽 주민센터를 안내하든 걸어서 갈 수 있는 거리다.
 */
function inRing(flat: readonly number[], px: number, py: number): boolean {
  let inside = false;
  let x = flat[0] as number;
  let y = flat[1] as number;
  const x0 = x;
  const y0 = y;
  for (let i = 2; i < flat.length; i += 2) {
    const nx = x + (flat[i] as number);
    const ny = y + (flat[i + 1] as number);
    if (y > py !== ny > py && px < ((nx - x) * (py - y)) / (ny - y) + x) inside = !inside;
    x = nx;
    y = ny;
  }
  // 데이터가 닫혀 있지만, 마지막 변을 빠뜨리면 판정이 뒤집히므로 명시적으로 잇는다.
  if (x !== x0 || y !== y0) {
    if (y > py !== y0 > py && px < ((x0 - x) * (py - y)) / (y0 - y) + x) inside = !inside;
  }
  return inside;
}

/**
 * 화면에 보일 시군구 이름. "수원시장안구" → "수원시 장안구"
 *
 * **보이기 위한 것이지 보내기 위한 것이 아니다.** 서버에는 원본을 그대로 보낸다.
 */
export function districtLabel(district: string): string {
  const m = /^(.+?[시군])([가-힣]+구)$/.exec(district);
  return m ? `${m[1]} ${m[2]}` : district;
}

/**
 * 좌표가 속한 행정동. 바다나 국경 밖이면 null이다.
 *
 * **좌표를 받아서 쓰고 버린다.** 이 함수는 좌표를 어디에도 남기지 않는다.
 */
export function placeAt(longitude: number, latitude: number): LocatedPlace | null {
  const px = Math.round(longitude * SCALE);
  const py = Math.round(latitude * SCALE);

  for (const area of AREAS) {
    const [w, s, e, n] = area.b as [number, number, number, number];
    if (px < w || px > e || py < s || py > n) continue;
    for (const ring of area.r) {
      if (inRing(ring, px, py)) {
        return { sido: area.s, district: area.g, dong: area.d };
      }
    }
  }
  return null;
}
