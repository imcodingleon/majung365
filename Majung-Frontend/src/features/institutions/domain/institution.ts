// 안내할 기관 (§5.4).
//
// "가까운 주민센터", "관할 지부"라고만 하면 사용자는 다시 찾아야 한다. 어디로 가면 되는지
// 이름과 주소와 전화번호까지 짚어주는 것이 목표다.

/**
 * 공단 기관의 종류. **한 덩어리로 다루면 안 된다.**
 * "가까운 공단"을 물었는데 교육원이 나오면 헛걸음이다.
 */
export type BranchKind = "branch" | "head" | "training" | "hug";

import type { DistrictOffice, Institution } from "@/shared/types";

export type { DistrictOffice, Institution };

/** 한 지역에서 안내할 것. 서버가 시도·시군구를 받아 돌려준다. */
export type NearbyResult = {
  /** 그 시군구의 주민센터 전체. 위치로 알아낸 동으로 좁혀 쓴다. */
  offices: readonly DistrictOffice[];
  /**
   * 공단 기관과 지역 센터.
   *
   * **공단 기관은 지역이 안 맞아도 들어 있다.** 전국에 몇 곳뿐이라 지역으로 거르면
   * 사라지고, 그러면 주 경로가 화면에서 없어진다. `kind`로 갈라 그린다.
   */
  institutions: readonly Institution[];
};

// **확인 날짜 필드를 두지 않는다.** 이 목록의 데이터에는 확인 날짜가 없다.
// 자리를 만들어 두면 다른 데서 가져온 날짜가 채워지고, 그것이 이 목록을 확인한
// 날짜인 것처럼 화면에 나간다. 실제로 그렇게 되어 있었다.
//
// 서버가 항목마다 검증 여부와 날짜를 실어 주면 그때 항목 단위로 둔다 —
// 지금 이 목록은 공식 검증된 것과 예시가 섞여 있어 묶음 하나로 말할 수 없다.

/** 어느 지원 항목에서 어떤 공단 기관을 안내할지 (§5.4). */
export function branchKindFor(routeId: string): BranchKind {
  if (routeId === "R6" || routeId === "R7") return "training";
  if (routeId === "R8") return "hug";
  return "branch";
}

export function kindLabel(kind: BranchKind): string {
  switch (kind) {
    case "training":
      return "직업교육을 받는 곳";
    case "hug":
      return "상담받는 곳";
    case "head":
      return "본부";
    case "branch":
      return "찾아가실 지부";
  }
}
