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
import { useCallback, useState } from "react";

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

export function useRegionLookup() {
  const [state, setState] = useState<LookupState>({ status: "idle" });
  /** 직접 고른 지역. 위치로 알아낸 것보다 이쪽이 우선한다. */
  const [picked, setPicked] = useState<SelectedRegion | null>(null);

  const locate = useCallback(async () => {
    setState({ status: "locating" });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setState({ status: "denied" });
        return;
      }

      // 정확도를 높게 잡을 이유가 없다. 동 하나를 가르는 데 필요한 만큼이면 된다.
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });
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

  /** 위치로 알아낸 곳. 직접 고른 지역이 있으면 그쪽이 이긴다. */
  const place: LocatedPlace | null =
    picked !== null
      ? { sido: picked.sido, district: picked.district ?? "", dong: "" }
      : state.status === "resolved"
        ? state.place
        : null;

  return { state, place, locate, pick, reset };
}
