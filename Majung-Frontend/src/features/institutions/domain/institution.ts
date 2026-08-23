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
