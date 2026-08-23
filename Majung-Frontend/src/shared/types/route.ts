// 지원 항목 식별자 (intake-contract.md §2).
//
// R5(가족지원)는 폐기했고 번호는 결번으로 남긴다. 다시 매기면 기존 기획서의 참조가 전부 어긋난다.
// 따라서 지원 항목은 14개이며 식별자는 R1~R4와 R6~R15다.
//
// 여러 feature가 함께 쓰는 계약 개념이라 shared에 둔다.
// e8 세션의 계약 커밋이 올라오면 shared/types/api.ts의 서버 계약과 맞춰 정리한다.
export type RouteId =
  | "R1" | "R2" | "R3" | "R4"
  | "R6" | "R7" | "R8" | "R9" | "R10"
  | "R11" | "R12" | "R13" | "R14" | "R15";

/**
 * 지원 항목 이름. 정본은 `Majung-Backend/app/domains/shared/routes.py`의 `ROUTE_LABELS`다.
 *
 * **할 일 목록은 서버가 이름을 함께 주므로 이 표가 필요 없다.** 여기는 담당자 화면처럼
 * 코드만 오는 자리에서 쓴다. 서버가 이름을 주는 곳에서는 그 값을 그대로 쓴다 —
 * 표를 두 군데 두면 한쪽만 고치는 날이 온다.
 */
const ROUTE_LABELS: Record<string, string> = {
  R1: "숙식제공",
  R2: "공단 긴급지원",
  R3: "기초건강지원",
  R4: "주거지원",
  R6: "취업·허그일자리",
  R7: "창업지원",
  R8: "심리상담",
  R9: "신분증",
  R10: "통장",
  R11: "주민등록 주소",
  R12: "생계급여",
  R13: "수용·출소증명서",
  R14: "개인회생·파산",
  R15: "의료급여·건강보험",
};

/** 모르는 코드면 코드를 그대로 낸다. 빈 칸보다 낫다 — 무엇이 어긋났는지 보인다. */
export function routeLabel(id: string): string {
  return ROUTE_LABELS[id] ?? id;
}
