// 서류철 인덱스 탭의 항목별 색 (§5.1). 중요도 순서대로 배정하는 분류용 색이며
// 브랜드 색과 역할이 다르다. NativeWind는 클래스명을 런타임에 조립할 수 없으므로
// 색 배정은 이 상수를 통해 인라인 style로 넘긴다.
export const FOLDER_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#16a34a",
  "#2563eb",
  "#7c3aed",
] as const;

/** 완료한 항목은 순서와 무관하게 초록으로 덮는다. */
export const FOLDER_DONE = {
  tab: "#16a34a",
  headBg: "#f3faf4",
  headLine: "#bfe3c6",
  title: "#3e7a49",
} as const;

/** 항목 수가 색 수를 넘으면 앞에서부터 다시 쓴다. */
export function folderColor(index: number): string {
  return FOLDER_COLORS[index % FOLDER_COLORS.length];
}

/** 튀어나온 탭의 폭과 계단식 어긋남 폭 (§5.1). 프로토타입의 --tab-out·--tab-step. */
export const TAB_OUT = 54;
export const TAB_STEP = 13;
/** 탭이 카드 안쪽으로 물리는 깊이. 카드와 탭이 한 장으로 보이게 한다. */
export const TAB_OVERLAP = 14;
export const TAB_HEIGHT = 34;

