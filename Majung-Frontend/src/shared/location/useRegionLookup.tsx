// 지금 있는 지역 알아내기 (§5.4).
//
// **좌표를 서버로 함께 보낸다** (2026-08-26 결정 F-1). 예선부터 이어온 "좌표는 그
// 자리에서 버린다"를 뒤집었다 — 시군구까지만 아는 서버는 그 동네 기관들의 한가운데로
// 거리를 재는데, 시군구 안에서 그 한가운데가 엉뚱한 곳을 가리켰다. 군포역에 사는
// 사람에게 산본 주민센터가 먼저 나왔다.
//
// **동으로 바꾸는 계산은 그대로 기기에서 한다.** 아래 두 이유는 좌표를 보내기로 한
// 뒤에도 그대로 유효하다.
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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getMe, patchMe } from "@/shared/utils/api";
import { lastPlace, markPlace } from "@/shared/utils/storage";
import { loadToken } from "@/shared/utils/tokenStore";

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

function useRegionLookupState() {
  const [state, setState] = useState<LookupState>({ status: "idle" });
  /** 직접 고른 지역. 위치로 알아낸 것보다 이쪽이 우선한다. */
  const [picked, setPicked] = useState<SelectedRegion | null>(null);
  /**
   * 지난번에 알아낸 곳. **렌더 전에 한 번만 읽는다.**
   *
   * effect로 읽으면 첫 그림에서 위치를 모르는 상태가 스쳐, 기관 조회가 한 번
   * 헛돌고 화면이 깜빡인다.
   */
  const [remembered, setRemembered] = useState<LocatedPlace | null>(() => lastPlace());

  /**
   * 기기가 모르면 서버에 물어본다 (2026-08-26 결정 F-1).
   *
   * **기기에 있으면 묻지 않는다.** 이 길로 오는 것은 브라우저를 지웠거나 기기를 바꾼
   * 경우이고, 그때만 요청 하나가 더 나간다. 매번 물으면 화면을 열 때마다 왕복이 는다.
   */
  useEffect(() => {
    if (remembered) return;
    let alive = true;
    void (async () => {
      const token = await loadToken();
      if (!token) return;
      try {
        const me = await getMe(token);
        const found = me.place;
        if (!alive || !found?.sido || !found.district) return;
        setRemembered({
          sido: found.sido,
          district: found.district,
          dong: found.dong ?? "",
          // 좌표는 짝으로만 쓴다. 지역을 직접 골랐던 사람에게는 없다.
          ...(typeof found.lat === "number" && typeof found.lng === "number"
            ? { lat: found.lat, lng: found.lng }
            : {}),
        });
      } catch {
        // 못 물어봐도 화면은 뜬다. 위치를 새로 잡거나 지역을 고르는 길이 그대로 있다.
      }
    })();
    return () => {
      alive = false;
    };
  }, [remembered]);

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
      return {
        sido: picked.sido,
        district: picked.district ?? "",
        dong: picked.dong ?? "",
        // **동까지 골랐으면 그 동의 대표 좌표가 실려 온다** (2026-08-31). 그전에는
        // 직접 고른 사람에게 좌표가 없어 지도가 거리를 재지 못했다. 좌표는 짝으로만
        // 다루므로 하나만 있으면 없는 것으로 친다.
        ...(typeof picked.lat === "number" && typeof picked.lng === "number"
          ? { lat: picked.lat, lng: picked.lng }
          : {}),
      };
    }
    if (state.status === "resolved") return state.place;
    // **지난번에 알아낸 곳을 쓴다.** 저장하지 않았을 때는 새로고침할 때마다 위치를
    // 다시 잡아야 했고, 심사·시연을 웹으로 하는데 그것은 기능이 없는 것과 같았다.
    return remembered;
  }, [picked, state, remembered]);

  // 새로 정해진 곳을 기기에 남긴다. 좌표까지 함께 남겨야 새로고침 뒤에도 그 자리를
  // 기준으로 거리를 잰다 (2026-08-26 결정 F-1).
  useEffect(() => {
    if (!place || !place.sido || !place.district) return;
    markPlace(place);

    // **서버에도 남긴다.** 기기에만 두면 브라우저를 지웠거나 기기를 바꿨을 때 그 자리를
    // 다시 잡아야 한다. 서버가 알면 로그인만으로 지도가 제자리에서 뜬다.
    //
    // 실패해도 조용히 넘어간다. 기기에는 이미 남았으므로 지금 화면은 그대로 돌고,
    // 위치를 못 올렸다고 사용자에게 알릴 일이 아니다.
    void (async () => {
      const token = await loadToken();
      if (!token) return;
      try {
        await patchMe(token, {
          place: {
            sido: place.sido,
            district: place.district,
            dong: place.dong,
            // 좌표는 짝으로만 보낸다. 지역을 직접 고른 경우에는 없다.
            ...(typeof place.lat === "number" && typeof place.lng === "number"
              ? { lat: place.lat, lng: place.lng }
              : {}),
          },
        });
      } catch {
        // 기기에는 남았다. 다음에 위치가 정해질 때 다시 시도된다.
      }
    })();
  }, [place]);

  return { state, place, locate, pick, reset };
}

/**
 * 지금 있는 곳을 화면들이 **함께** 본다.
 *
 * **훅을 화면마다 부르면 각자 다른 곳을 들게 된다.** 실제로 그래서, 지도에서 "지역
 * 변경"으로 지역을 바꿔도 **홈의 "가까운 곳"이 예전 지역 그대로 남았다** — 지도는
 * 자기 훅 인스턴스의 값을 보고, 홈은 가입할 때 세션에 박힌 값을 보고 있었다. 새 값은
 * 기기와 서버에만 적히므로 새로고침 전에는 어느 쪽도 그것을 몰랐다.
 *
 * **`(tabs)`가 아니라 루트에 둔다.** 가입 화면(`app/signup.tsx`)이 탭 밖인데 이 값을
 * 쓴다.
 */
const RegionLookupContext = createContext<ReturnType<typeof useRegionLookupState> | null>(
  null,
);

export function RegionLookupProvider({ children }: { children: ReactNode }) {
  const value = useRegionLookupState();
  return <RegionLookupContext.Provider value={value}>{children}</RegionLookupContext.Provider>;
}

export function useRegionLookup() {
  const shared = useContext(RegionLookupContext);
  if (shared === null) {
    // **Provider 없이 부르면 조용히 어긋난다.** 자기만의 위치를 들고 도는데 화면은
    // 그것을 알 수 없어, 한쪽만 갱신되는 이유를 찾기 어려워진다.
    throw new Error("RegionLookupProvider 안에서만 쓸 수 있어요.");
  }
  return shared;
}
