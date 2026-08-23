// 안내할 기관 (§5.4).
//
// "가까운 주민센터", "관할 지부"라고만 하면 사용자는 다시 찾아야 한다. 어디로 가면 되는지
// 이름과 주소와 전화번호까지 짚어주는 것이 목표다.

/**
 * 공단 기관의 종류. **한 덩어리로 다루면 안 된다.**
 * "가까운 공단"을 물었는데 교육원이 나오면 헛걸음이다.
 */
export type BranchKind = "branch" | "head" | "training" | "hug";

export type Institution = {
  name: string;
  address: string;
  phone: string;
  /** 공단 기관이면 종류가 붙는다. 정신건강복지센터에는 없다. */
  kind?: BranchKind;
  /** 같은 시군구에 여러 센터가 있을 때의 구분. 예: "아동청소년" */
  note?: string;
};

/** 한 지역에서 안내할 기관 묶음. 서버가 시군구를 받아 돌려준다. */
export type RegionInstitutions = {
  /** 공단 지부. 광역 단위라 시군구를 몰라도 짚을 수 있다. */
  branches: readonly Institution[];
  /** 기초정신건강복지센터. 시군구를 알아야 한다. */
  centers: readonly Institution[];
  /** 마중365가 이 목록을 확인한 날짜(YYYY-MM-DD). */
  checkedAt?: string;
};

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
