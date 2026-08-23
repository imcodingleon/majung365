// 홈 '자주 찾는 서비스' 6종 — 순수 데이터. Figma 2:667 카드 원문 + 챗 자동질문.
// 각 질문은 백엔드 triage를 거쳐 지원 항목(R1~R15)으로 라우팅된다.
// id는 초기 진단의 6분야 코드(S1~S6, intake-contract.md §2)와 맞춘다.
import type { ImageSourcePropType } from "react-native";

export interface HomeService {
  /** 초기 진단 분야 코드 S1~S6. */
  id: string;
  title: string;
  desc: string;
  /** 타일 탭 시 챗으로 자동 전송되는 질문(쉬운 말, 1인칭). */
  question: string;
  icon: ImageSourcePropType;
  /** 아이콘 배경색(Figma 원본). */
  iconBg: string;
}

export const HOME_SERVICES: HomeService[] = [
  {
    id: "S3", // 신분·행정
    title: "신분증/인증",
    desc: "잊어버린 나의 증명서, 재발급을 도와드려요.",
    question: "신분증하고 통장, 휴대폰을 다시 만들고 싶어요. 어디서부터 해야 하나요?",
    icon: require("../../../../assets/images/home/identity.png") as ImageSourcePropType,
    iconBg: "#ffdcc0",
  },
  {
    id: "S1", // 주거
    title: "머물 곳 찾기",
    desc: "안전하게 쉴 수 있는 공간을 연결해드려요.",
    question: "당장 지낼 곳이 없어요. 오늘 머물 수 있는 곳을 알려주세요.",
    icon: require("../../../../assets/images/home/housing.png") as ImageSourcePropType,
    iconBg: "#ffdcc0",
  },
  {
    id: "S2", // 생계·긴급비용
    title: "지원제도 찾기",
    desc: "긴급 식료품과 생활비를 지원받는 방법.",
    question: "생활비가 없어요. 긴급복지 같은 지원을 받고 싶어요.",
    icon: require("../../../../assets/images/home/welfare.png") as ImageSourcePropType,
    iconBg: "#ffdcc0",
  },
  {
    id: "S4", // 취업·직업
    title: "일자리 찾기",
    desc: "나에게 맞는 일자리와 기술 교육 안내.",
    question: "전과가 있어도 할 수 있는 일자리를 찾고 싶어요.",
    icon: require("../../../../assets/images/home/employment.png") as ImageSourcePropType,
    iconBg: "#b5d4f4",
  },
  {
    id: "S5", // 건강·심리
    title: "마음 돌보기",
    desc: "지친 마음을 위로하고 상담을 예약해보세요.",
    question: "요즘 마음이 너무 힘들어요. 상담을 받고 싶어요.",
    icon: require("../../../../assets/images/home/health.png") as ImageSourcePropType,
    iconBg: "#b5d4f4",
  },
  {
    id: "S6", // 기타·권리구제
    title: "빚 문제 해결",
    desc: "채무 조정과 법률적인 도움이 필요하신가요?",
    question: "빚 때문에 너무 힘들어요. 채무 조정을 받고 싶어요.",
    icon: require("../../../../assets/images/home/debt.png") as ImageSourcePropType,
    iconBg: "#ffdad6",
  },
];
