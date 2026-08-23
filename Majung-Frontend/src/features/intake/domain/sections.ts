// 초기 진단의 6분야 (§3.7 · intake-contract.md §2).
// 분야는 문항을 묶어 보여주기 위한 화면 단위일 뿐이며, 할 일의 순서를 정하지 않는다.
// 정렬 단위는 지원 항목(R번호)이다 (§4).
//
// "영역"과 "설문"은 쓰지 않는다. 폐기한 6영역 분류와 혼동되고, 조사받는 어감을 피한다.
import type { ImageSourcePropType } from "react-native";

import type { RouteId } from "@/shared/types/route";

export type SectionId = "housing" | "living" | "identity" | "employment" | "health" | "rights";

export type Section = {
  id: SectionId;
  /** 화면에 나가는 분야 이름. */
  label: string;
  icon: ImageSourcePropType;
  /** 이 분야의 문항이 결정하는 지원 항목들. */
  routes: readonly RouteId[];
};

export const SECTIONS: readonly Section[] = [
  {
    id: "housing",
    label: "주거",
    icon: require("../../../../assets/images/sections/housing.png") as ImageSourcePropType,
    routes: ["R1", "R4", "R11"],
  },
  {
    id: "living",
    label: "생계·긴급비용",
    icon: require("../../../../assets/images/sections/living.png") as ImageSourcePropType,
    routes: ["R2", "R12"],
  },
  {
    id: "identity",
    label: "신분·행정",
    icon: require("../../../../assets/images/sections/identity.png") as ImageSourcePropType,
    routes: ["R9", "R10"],
  },
  {
    id: "employment",
    label: "취업·직업",
    icon: require("../../../../assets/images/sections/employment.png") as ImageSourcePropType,
    routes: ["R6", "R7"],
  },
  {
    id: "health",
    label: "건강·심리",
    icon: require("../../../../assets/images/sections/health.png") as ImageSourcePropType,
    routes: ["R3", "R8"],
  },
  {
    id: "rights",
    label: "기타·권리구제",
    // 이 아이콘만 새로 그려야 한다. 채무만 가리키던 debt를 그대로 옮겨 둔 것이며,
    // 지금은 출소증명서와 의료보장까지 포함하도록 의미가 넓어졌다 (§3.7).
    icon: require("../../../../assets/images/sections/rights.png") as ImageSourcePropType,
    routes: ["R13", "R14", "R15"],
  },
];
