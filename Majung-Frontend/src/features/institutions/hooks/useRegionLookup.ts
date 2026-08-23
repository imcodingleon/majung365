// 지금 있는 지역 알아내기 (§5.4).
//
// **좌표를 우리 서버로 보내지 않는다.** 기기에서 시군구로 바꾸고 좌표는 바로 버린다.
// 이 훅은 좌표를 상태에 담지도 않는다. 남겨두면 언젠가 어딘가로 실려 간다.
//
// Google Maps Geocoding API는 쓰지 않는다. 좌표가 통째로 구글로 나간다.
//
// ⚠️ 안드로이드의 Geocoder는 프레임워크 내장이 아니라 백엔드 서비스에 의존한다.
// **역지오코딩 과정에서 좌표가 기기 밖으로 나갈 수 있다.** 우리 서버로 가지 않는다는 것과
// 어디로도 가지 않는다는 것은 다른 말이다. 실기기 확인이 필요하다 (§12-13).
// 비행기 모드에서 이 훅이 동작하면 기기 안에서 끝나는 것이고, 실패하면 네트워크를 탄다.
import * as Location from "expo-location";
import { useCallback, useState } from "react";

import { matchRegion, type SelectedRegion } from "../domain/region";

export type LookupState =
  | { status: "idle" }
  | { status: "locating" }
  /** 위치를 얻어 지역까지 알아냈다. */
  | { status: "resolved"; region: SelectedRegion }
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

      // 정확도를 높게 잡을 이유가 없다. 시군구만 알면 된다.
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });
      const found = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      // 좌표는 여기서 끝난다. 아래로 넘기지 않는다.

      const first = found[0];
      if (!first) {
        setState({ status: "failed", reason: "지금 계신 곳을 알아내지 못했어요." });
        return;
      }

      const region = matchRegion([first.region, first.city, first.district, first.subregion]);
      if (!region) {
        setState({ status: "failed", reason: "지금 계신 곳이 어느 지역인지 알아보지 못했어요." });
        return;
      }
      setState({ status: "resolved", region });
    } catch {
      // 네트워크가 없을 때 안드로이드 역지오코딩이 여기로 떨어진다 (§12-13 확인 지점).
      setState({
        status: "failed",
        reason: "지금 계신 곳을 알아내지 못했어요. 인터넷이 끊겨 있으면 그럴 수 있어요.",
      });
    }
  }, []);

  const pick = useCallback((region: SelectedRegion) => setPicked(region), []);
  const reset = useCallback(() => {
    setPicked(null);
    setState({ status: "idle" });
  }, []);

  const region = picked ?? (state.status === "resolved" ? state.region : null);

  return { state, region, locate, pick, reset };
}
