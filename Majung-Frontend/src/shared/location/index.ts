// 지금 있는 곳 알아내기 (§5.4).
//
// **feature가 아니라 shared에 둔다.** 가입 화면(위치 동의)과 기관 안내 화면이 함께
// 쓰고, 할 일 카드도 쓰게 된다. 어느 한 feature의 것이 아니다.
export {
  placeAt,
  districtLabel,
  byDistanceFrom,
  officesByDistance,
  shortSido,
  sameSido,
  type LocatedPlace,
} from "./locate";
export { RegionLookupProvider, useRegionLookup, type LookupState } from "./useRegionLookup";
