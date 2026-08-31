// 열린 할 일 카드에 맞는 근처 기관 (§5.4).
//
// **열린 카드만 부른다.** 할 일이 열넷까지 나올 수 있는데 전부 미리 부르면 요청이
// 그만큼 나간다. 아코디언이라 한 번에 하나만 열리므로 그때 부르면 된다.
//
// **좌표는 여기 오지 않는다.** 세션에 담긴 것은 기기에서 이미 동 이름으로 바뀐 값이다.
import { useEffect, useState } from "react";

import type { LocatedPlace } from "@/shared/location";
import type { DistrictOffice, Institution } from "@/shared/types";
import { getDistrictOffices, getInstitutions } from "@/shared/utils/api";

/** 그 할 일에서 어디로 가는지. 항목마다 다르다 (§5.4). */
export type NearbyKind = "office" | "institution" | "none";

/**
 * 이 지원 항목에서 안내할 곳.
 *
 * **R11(주소)은 일부러 뺀다.** 전입신고는 새 주소지 관할이고 재등록은 거주지 관할이라,
 * **지금 있는 곳의 행정복지센터를 짚으면 틀린 곳으로 보내게 된다.** §5.4가 "사용자가
 * 자기가 살 곳을 알고 있다"고 정리해 둔 자리다.
 *
 * R9는 반대다. 전국 어느 곳에서나 되므로 가까운 곳을 짚는 것이 정확한 답이다.
 *
 * **R12(생계급여)를 여기 넣었다** (2026-08-31). 전에는 이 목록에 없어 `institution`으로
 * 떨어졌고, 그래서 **주민등록 창구에 가야 하는 일에 공단 지부가 떴다.** 주소지 관할에서
 * 신청하는 것이라 R9처럼 "어디서나"는 아니지만, 공단 지부를 짚는 것보다는 가까운
 * 행정복지센터를 세우고 관할을 확인하라고 말하는 편이 맞다.
 */
const OFFICE_ROUTES = new Set(["R9", "R12"]);

/**
 * 안내할 기관이 없는 항목.
 *
 * **R10은 은행, R13은 교정시설, R14는 법원이다.** 우리가 가진 데이터에 없고 서버도
 * 그 갈래를 모르므로, 물으면 그 지역과 무관한 것이 돌아와 카드에 그려진다.
 * 이 항목들의 창구 안내는 카드 본문이 맡는다.
 */
const NO_NEARBY = new Set(["R10", "R11", "R13", "R14"]);

export function nearbyKindFor(routeId: string): NearbyKind {
  if (OFFICE_ROUTES.has(routeId)) return "office";
  if (NO_NEARBY.has(routeId)) return "none";
  return "institution";
}

/**
 * 행정복지센터 목록 아래에 붙는 한 줄.
 *
 * **항목마다 관할 규칙이 달라 같은 말을 쓸 수 없다.** R9는 어디서나 되고 R12는
 * 주소지 관할이다. 이 말이 없으면 R9에서는 자기 동을 찾아 멀리 가고, R12에서는
 * 가까운 곳에 갔다가 헛걸음한다.
 */
export function officeNoteFor(routeId: string): string | undefined {
  if (routeId === "R9") return "어느 행정복지센터에서나 하실 수 있어요. 가까운 곳으로 가세요.";
  if (routeId === "R12")
    return "주민등록 주소지의 행정복지센터에서 신청해요. 아래는 가까운 순서예요.";
  return undefined;
}

type State = {
  offices: readonly DistrictOffice[];
  institutions: readonly Institution[];
  loading: boolean;
};

const EMPTY: State = { offices: [], institutions: [], loading: false };

export function useNearbyPlaces(routeId: string | null, place: LocatedPlace | null): State {
  const [state, setState] = useState<State>(EMPTY);

  const kind = routeId ? nearbyKindFor(routeId) : "none";
  const sido = place?.sido ?? "";
  const district = place?.district ?? "";

  useEffect(() => {
    if (!routeId || kind === "none" || !sido || !district) {
      setState(EMPTY);
      return;
    }
    let alive = true;
    setState({ ...EMPTY, loading: true });
    void (async () => {
      try {
        const found =
          kind === "office"
            ? { offices: await getDistrictOffices(sido, district), institutions: [] }
            : { offices: [], institutions: await getInstitutions(routeId, sido, district) };
        if (alive) setState({ ...found, loading: false });
      } catch {
        // **조용히 접는다.** 근처 기관은 덧붙는 안내이지 그 할 일의 본체가 아니다.
        // 여기서 오류 상자를 띄우면 정작 해야 할 일이 뒤로 밀린다.
        if (alive) setState(EMPTY);
      }
    })();
    return () => {
      alive = false;
    };
  }, [routeId, kind, sido, district]);

  return state;
}
