// 지금 있는 지역 알아내기 (§5.4).
//
// **좌표를 우리 서버로 보내지 않는다.** 기기에서 행정동으로 바꾸고 좌표는 바로 버린다.
// 이 훅은 좌표를 상태에 담지도 않는다. 남겨두면 언젠가 어딘가로 실려 간다.
//
// **좌표를 동으로 바꾸는 것도 기기 안에서 한다** (`domain/locate.ts`). `expo-location`의
// `reverseGeocodeAsync`를 쓰지 않는 이유가 둘이다.
//
// 하나. 안드로이드의 `Geocoder`는 프레임워크 내장이 아니라 백엔드 서비스에 의존해서
// **좌표가 기기 밖으로 나갈 수 있다**(§12-13 확인 항목). 우리 서버로 가지 않는다는 것과
// 어디로도 가지 않는다는 것은 다른 말이다. 직접 계산하면 그 경로가 아예 없어진다.
//
// 둘. **웹에는 그 함수의 구현이 없다.** 그냥 오류를 던진다. 심사·시연을 웹으로 하면
// 그 자리에서 기능이 죽는다.
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useState } from "react";

import { lastPlace, markPlace } from "@/shared/utils/storage";

import { placeAt, type LocatedPlace } from "./locate";
import { type SelectedRegion } from "@/features/institutions/domain/region";

export type LookupState =
  | { status: "idle" }
  | { status: "locating" }
  /** 위치를 얻어 행정동까지 알아냈다. */
  | { status: "resolved"; place: LocatedPlace }
  /** 사용자가 허가하지 않았다. 지역을 직접 고르는 길로 넘어간다. */
  | { status: "denied" }
  /** 허가는 받았지만 지역을 알아내지 못했다. 이유를 화면에 보여준다. */
  | { status: "failed"; reason: string };

/**
 * 위치를 기다리는 한도.
 *
 * 권한 팝업을 그냥 두거나 실내에서 위성을 못 잡는 경우가 실제로 있다. 15초는
 * 저리터러시 사용자가 팝업을 읽고 누르기에 넉넉하면서, 화면이 멈춘 것으로
 * 느껴지기 전이다.
 */
const LOCATE_TIMEOUT_MS = 15_000;

export function useRegionLookup() {
  const [state, setState] = useState<LookupState>({ status: "idle" });
  /** 직접 고른 지역. 위치로 알아낸 것보다 이쪽이 우선한다. */
  const [picked, setPicked] = useState<SelectedRegion | null>(null);
  /**
   * 지난번에 알아낸 곳. **렌더 전에 한 번만 읽는다.**
   *
   * effect로 읽으면 첫 그림에서 위치를 모르는 상태가 스쳐, 기관 조회가 한 번
   * 헛돌고 화면이 깜빡인다.
   */
  const [remembered] = useState<LocatedPlace | null>(() => lastPlace());

  const locate = useCallback(async () => {
    setState({ status: "locating" });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setState({ status: "denied" });
        return;
      }

      // 정확도를 높게 잡을 이유가 없다. 동 하나를 가르는 데 필요한 만큼이면 된다.
      //
      // **시간 제한을 건다.** 권한 팝업을 무시하거나 실내에서 위성을 못 잡으면
      // 이 약속은 끝나지 않고, 화면은 "알아보고 있어요…"에 영원히 멈춘다.
      // 기다리게 두는 것보다 "못 찾았어요"로 넘어가 지역을 고르게 하는 편이 낫다.
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), LOCATE_TIMEOUT_MS),
        ),
      ]);
      const place = placeAt(position.coords.longitude, position.coords.latitude);
      // 좌표는 여기서 끝난다. 아래로 넘기지 않는다.

      if (!place) {
        setState({ status: "failed", reason: "지금 계신 곳이 어느 지역인지 찾지 못했어요." });
        return;
      }
      setState({ status: "resolved", place });
    } catch {
      // 판정은 기기 안에서 끝나므로 여기로 오는 것은 위치 자체를 못 얻은 경우다.
      setState({ status: "failed", reason: "지금 계신 곳을 찾지 못했어요." });
    }
  }, []);

  const pick = useCallback((region: SelectedRegion) => setPicked(region), []);
  const reset = useCallback(() => {
    setPicked(null);
    setState({ status: "idle" });
  }, []);

  /**
   * 위치로 알아낸 곳. 직접 고른 지역이 있으면 그쪽이 이긴다.
   *
   * **매 렌더마다 새 객체를 만들지 않는다.** 직접 고른 경우 여기서 객체를 새로 만들면,
   * 이 값을 의존성으로 삼는 효과가 끝없이 다시 돈다 — 기관 안내 화면이 서버를 무한히
   * 부르게 된다. 값이 같으면 같은 객체를 돌려준다.
   */
  const place = useMemo<LocatedPlace | null>(() => {
    if (picked !== null) {
      return { sido: picked.sido, district: picked.district ?? "", dong: "" };
    }
    if (state.status === "resolved") return state.place;
    // **지난번에 알아낸 곳을 쓴다.** 저장하지 않았을 때는 새로고침할 때마다 위치를
    // 다시 잡아야 했고, 심사·시연을 웹으로 하는데 그것은 기능이 없는 것과 같았다.
    return remembered;
  }, [picked, state, remembered]);

  // 새로 정해진 곳을 기기에 남긴다. **서버에 보내지 않는다** (§9.4).
  useEffect(() => {
    if (place && place.sido && place.district) markPlace(place);
  }, [place]);

  return { state, place, locate, pick, reset };
}
