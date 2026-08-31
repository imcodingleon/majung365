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
import dongsData from "./dongs.json";

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
  /**
   * 지금 있는 자리. 지역을 직접 골랐으면 없다.
   *
   * **2026-08-26에 좌표를 살렸다.** 예선부터 이어온 "좌표는 그 자리에서 버린다"를
   * 뒤집은 것이다 — 시군구까지만 아는 서버는 그 동네 기관들의 한가운데로 거리를
   * 재는데, 시군구 안에서 그 한가운데가 엉뚱한 곳을 가리켰다. 군포역에 사는
   * 사람에게 산본 주민센터가 먼저 나왔다.
   */
  lat?: number;
  lng?: number;
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
 * **판정한 좌표를 결과에 함께 담는다** (2026-08-26 결정 F-1). 예전에는 여기서 버렸다.
 * 시군구까지만 아는 서버는 그 동네 기관들의 한가운데로 거리를 재는데, 시군구 안에서
 * 그 한가운데가 엉뚱한 곳을 가리켰다.
 */
export function placeAt(longitude: number, latitude: number): LocatedPlace | null {
  const px = Math.round(longitude * SCALE);
  const py = Math.round(latitude * SCALE);

  for (const area of AREAS) {
    const [w, s, e, n] = area.b as [number, number, number, number];
    if (px < w || px > e || py < s || py > n) continue;
    for (const ring of area.r) {
      if (inRing(ring, px, py)) {
        return { sido: area.s, district: area.g, dong: area.d, lat: latitude, lng: longitude };
      }
    }
  }
  return null;
}

/**
 * 두 지점의 대략적인 거리. 단위는 킬로미터다.
 *
 * **정확한 거리가 필요한 자리가 아니다.** 기관 여럿 중 어느 쪽이 가까운지만 가리면
 * 되므로, 위도에 따라 좁아지는 경도를 코사인으로 보정하는 정도로 충분하다.
 */
function roughKm(a: readonly [number, number], b: readonly [number, number]): number {
  const midLat = (((a[1] + b[1]) / 2) * Math.PI) / 180;
  const dx = (a[0] - b[0]) * Math.cos(midLat);
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy) * 111;
}

/** 경계 여럿을 감싸는 상자의 한가운데. */
function centerOf(areas: readonly Area[]): [number, number] | null {
  if (areas.length === 0) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const area of areas) {
    const [aw, as, ae, an] = area.b as [number, number, number, number];
    if (aw < w) w = aw;
    if (as < s) s = as;
    if (ae > e) e = ae;
    if (an > n) n = an;
  }
  return [(w + e) / 2 / SCALE, (s + n) / 2 / SCALE];
}

/** 사용자가 있는 곳의 한가운데. 동을 알면 동 기준, 모르면 시군구 기준이다. */
export function placeCenter(place: LocatedPlace): [number, number] | null {
  const inDistrict = AREAS.filter((a) => a.s === place.sido && a.g === place.district);
  if (inDistrict.length === 0) return null;
  const exact = place.dong ? inDistrict.filter((a) => a.d === place.dong) : [];
  return centerOf(exact.length > 0 ? exact : inDistrict);
}

/**
 * 주소 문자열이 가리키는 시군구의 한가운데.
 *
 * **주소는 도로명까지만 있고 동이 없다.** 공단 지부 서른여덟 곳이 전부 그렇다.
 * 그래서 시군구 단위로만 짚을 수 있는데, 넓은 시(화성시 같은)는 그만큼 오차가 커진다.
 * 어느 쪽이 더 가까운지를 가리는 데에는 쓸 수 있지만 **"몇 킬로미터"라고 말할 수는
 * 없다.** 정확한 거리가 필요해지면 기관마다 좌표를 받아야 한다.
 *
 * 경계 데이터의 시군구는 "수원시장안구"처럼 붙여 쓰므로 주소에서도 공백을 지우고 맞춘다.
 * 겹치는 것 중에는 가장 긴 것을 고른다 — "수원시"와 "수원시장안구"가 함께 맞으면
 * 구까지 아는 쪽이 정확하다.
 */
export function addressCenter(address: string): [number, number] | null {
  const flat = address.replace(/\s+/g, "");
  let bestKey: string | null = null;
  for (const area of AREAS) {
    // **주소가 짧은 시도 이름으로 오기도 한다.** "경북 예천군"·"인천 서구"처럼 쓴 것이
    // 서른여덟 곳 중 아홉이다. 긴 이름만 맞추면 그것들이 전부 거리 없음으로 밀려
    // 정렬이 무너진다. 두 형태를 다 본다.
    for (const key of [`${area.s}${area.g}`, `${shortSido(area.s)}${area.g}`]) {
      if (flat.startsWith(key) && (bestKey === null || key.length > bestKey.length)) {
        bestKey = key;
      }
    }
  }
  if (bestKey === null) return null;
  const key = bestKey;
  return centerOf(
    AREAS.filter((a) => `${a.s}${a.g}` === key || `${shortSido(a.s)}${a.g}` === key),
  );
}

/**
 * 사용자가 있는 곳에서 가까운 순으로 세운다.
 *
 * **주소를 못 읽은 것은 뒤로 보내되 버리지 않는다.** 지금은 전부 읽히지만, 데이터가
 * 늘면서 형식이 다른 것이 들어와도 목록에서 사라지지는 않아야 한다.
 */
export function byDistanceFrom<T extends { address: string }>(
  place: LocatedPlace,
  items: readonly T[],
): readonly T[] {
  const from = placeCenter(place);
  if (!from) return items;
  return [...items]
    .map((item) => {
      const at = addressCenter(item.address);
      return { item, km: at ? roughKm(from, at) : Infinity };
    })
    .sort((a, b) => a.km - b.km)
    .map((x) => x.item);
}

/**
 * 경계 데이터의 시도 이름을 기관 데이터가 쓰는 짧은 이름으로 바꾼다.
 *
 * **끝의 "도"만 떼면 여섯 개 도가 통째로 어긋난다.** 기관 데이터는 "전남"이라고
 * 쓰는데 그렇게 만들면 "전라남"이 나온다. 경남·경북·전남·전북·충남·충북이 모두
 * 같은 모양이라, 이 여섯 곳에 사는 사람에게는 **공단 기관이 하나도 뜨지 않았다.**
 * 줄임말이 규칙적이지 않으므로 표로 적어 둔다.
 */
const SHORT_SIDO: Record<string, string> = {
  강원도: "강원",
  강원특별자치도: "강원",
  경기도: "경기",
  경상남도: "경남",
  경상북도: "경북",
  광주광역시: "광주",
  대구광역시: "대구",
  대전광역시: "대전",
  부산광역시: "부산",
  서울특별시: "서울",
  세종특별자치시: "세종",
  울산광역시: "울산",
  인천광역시: "인천",
  전라남도: "전남",
  전라북도: "전북",
  전북특별자치도: "전북",
  제주특별자치도: "제주",
  제주도: "제주",
  충청남도: "충남",
  충청북도: "충북",
};

/**
 * 기관 데이터와 맞추기 위한 짧은 시도 이름.
 *
 * 표에 없으면 끝의 접미사를 떼는 예전 방식으로 물러선다 — 새 이름이 생겨도 목록이
 * 통째로 비지는 않게 한다.
 */
export function shortSido(sido: string): string {
  return SHORT_SIDO[sido] ?? sido.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "");
}

/** 기관의 시도가 이 지역과 같은지. 양쪽 표기가 달라도 맞춘다. */
export function sameSido(institutionSido: string, place: LocatedPlace): boolean {
  const short = shortSido(place.sido);
  return institutionSido === short || institutionSido === place.sido;
}

/**
 * 주민센터를 가까운 순으로 세운다.
 *
 * **주민센터는 동을 알고 있어서 정확하게 잴 수 있다.** 기관 주소가 도로명뿐이라
 * 시군구 중심으로만 재야 하는 것과 다르다. 그래서 이름을 맞춰 보는 대신 거리로
 * 세운다 — 경계 데이터가 "불당동"인데 주민센터는 "불당1동"·"불당2동"으로 갈려 있는
 * 식의 어긋남을 이름으로 풀려던 것이 애초에 무리였다.
 */
export function officesByDistance<T extends { sido: string; sigungu: string; dong: string }>(
  place: LocatedPlace,
  offices: readonly T[],
): readonly T[] {
  const from = placeCenter(place);
  if (!from) return offices;
  return [...offices]
    .map((office) => {
      const at = centerOf(
        AREAS.filter(
          (a) => a.g === office.sigungu && a.d === office.dong && shortSido(a.s) === shortSido(office.sido),
        ),
      );
      return { office, km: at ? roughKm(from, at) : Infinity };
    })
    .sort((a, b) => a.km - b.km)
    .map((x) => x.office);
}

/**
 * `regions.json`의 시군구 표기와 경계 데이터의 표기가 어긋나는 곳.
 *
 * **시군구 230개 중 둘뿐이다.** 규칙으로 풀려다가는 나머지 228개를 망가뜨리므로 표로
 * 적어 둔다 — `SHORT_SIDO`와 같은 이유다.
 *
 * - **부산 "진구"**: 정식 명칭이 "부산진구"라 접두로도 안 걸린다.
 * - **대구 "군위군"**: 2023-07-01에 경북에서 대구로 넘어왔는데 경계 데이터는 2021년
 *   것이라 아직 경북에 있다. 시도부터 어긋난다.
 *
 * 이 표가 없으면 그 두 곳 주민은 동을 고르는 단계를 통째로 못 밟는다.
 */
const DISTRICT_ALIAS: Record<string, readonly [string, string]> = {
  "부산|진구": ["부산", "부산진구"],
  "대구|군위군": ["경북", "군위군"],
};

/**
 * `${짧은 시도}|${경계 시군구}` → 그 시군구의 경계들.
 *
 * **첫 호출에 한 번만 만든다.** 검색 색인을 세울 때 시군구 230개를 잇달아 조회하는데,
 * 그때마다 3,495행을 훑으면 80만 번 비교가 되어 첫 타이핑이 눌린다.
 */
let byDistrict: Map<string, Area[]> | null = null;

function districtIndex(): Map<string, Area[]> {
  if (byDistrict) return byDistrict;
  const map = new Map<string, Area[]>();
  for (const area of AREAS) {
    const key = `${shortSido(area.s)}|${area.g}`;
    const bucket = map.get(key);
    if (bucket) bucket.push(area);
    else map.set(key, [area]);
  }
  byDistrict = map;
  return map;
}

/**
 * 그 시군구의 경계들. 시도는 긴 이름·짧은 이름 어느 쪽으로 주어도 된다
 * (`shortSido`가 짧은 이름 열일곱에 멱등이다).
 *
 * **정확히 맞는 것을 먼저 찾고, 없을 때만 접두로 넓힌다.** 지금 데이터에서는 접두를
 * 단독으로 써도 어긋나는 곳이 하나도 없지만, 경계 데이터가 갱신되어 기존 자치구 이름으로
 * 시작하는 일반구가 생기면 접두 단독 규칙은 조용히 두 지역을 섞는다.
 *
 * 접두로 걸리는 것은 일반구를 둔 시 열 곳이다 — "수원시"를 주면 장안·권선·팔달·영통
 * 네 구의 동 마흔넷이 한 목록으로 나온다. **일반구를 단계로 만들지 않는 이유**는 서버
 * 계약의 시군구가 "수원시"이고, 네 구의 동 이름이 하나도 겹치지 않기 때문이다.
 */
function areasOf(sido: string, district: string): readonly Area[] {
  const [s, g] = DISTRICT_ALIAS[`${shortSido(sido)}|${district}`] ?? [sido, district];
  const index = districtIndex();
  const key = `${shortSido(s)}|${g}`;

  const exact = index.get(key);
  if (exact) return exact;

  const found: Area[] = [];
  for (const [k, areas] of index) {
    if (k.startsWith(key)) found.push(...areas);
  }
  return found;
}

/**
 * 그 시군구의 행정동 이름. 순서는 경계 데이터 순서다.
 *
 * **읍·면도 함께 나온다.** 군 지역은 목록이 "예천읍"·"용문면"으로 채워진다.
 */
export function dongsOf(sido: string, district: string): readonly string[] {
  return areasOf(sido, district).map((a) => a.d);
}

/**
 * 그 행정동의 대표 좌표 `[경도, 위도]`. 못 찾으면 null이다.
 *
 * **지역을 직접 고른 사람에게 거리를 돌려주는 자리다.** 시군구 한가운데로 재던 것을
 * 동 한가운데로 좁힌다 — 산본1동과 군포시 한가운데가 이미 2.4km 벌어져 있어서,
 * 결정 F-1이 적어 둔 "군포역 사람에게 산본 주민센터" 문제가 그대로 재현된다.
 */
export function dongCenter(
  sido: string,
  district: string,
  dong: string,
): [number, number] | null {
  return centerOf(areasOf(sido, district).filter((a) => a.d === dong));
}
