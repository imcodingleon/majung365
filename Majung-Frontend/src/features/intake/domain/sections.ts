// 초기 진단의 6분야 (§3.7 · intake-contract.md §2).
// 분야는 문항을 묶어 보여주기 위한 화면 단위일 뿐이며, 할 일의 순서를 정하지 않는다.
// 정렬 단위는 지원 항목(R번호)이다 (§4).
//
// "영역"과 "설문"은 쓰지 않는다. 폐기한 6영역 분류와 혼동되고, 조사받는 어감을 피한다.
//
// 아이콘은 여기 없다. 색이 상태(안 답함·다 답함)를 따라가야 해서 벡터로 그렸고,
// 그림은 views/SectionIcon.tsx가 id로 찾아 쓴다.
import type { RouteId } from "@/shared/types/route";

export type SectionId = "housing" | "living" | "identity" | "employment" | "health" | "rights";

export type Section = {
  id: SectionId;
  /** 화면에 나가는 분야 이름. */
  label: string;
  /** 이 분야의 문항이 결정하는 지원 항목들. */
  routes: readonly RouteId[];
};

export const SECTIONS: readonly Section[] = [
  {
    id: "housing",
    label: "주거",
    routes: ["R1", "R4", "R11"],
  },
  {
    id: "living",
    label: "생계·긴급비용",
    routes: ["R2", "R12"],
  },
  {
    id: "identity",
    label: "신분·행정",
    routes: ["R9", "R10"],
  },
  {
    id: "employment",
    label: "취업·직업",
    routes: ["R6", "R7"],
  },
  {
    id: "health",
    label: "건강·심리",
    routes: ["R3", "R8"],
  },
  {
    id: "rights",
    label: "기타·권리구제",
    routes: ["R13", "R14", "R15"],
  },
];
