// 온보딩 구조화 질문 (CAP-1a). 순수 데이터.
// 그래프 코어 9노드(_bmad-output/specs/spec-majung-2nd/graph-design.md) 기준 재설계.
// nodeId는 백엔드 graph.json의 노드 id와 정확히 일치해야 한다(계약).
// ⚠️ 문구는 초안 — 공단 인터뷰 후 확정. 판단하지 않는 톤·쉬운 말 유지.

/** 그래프 노드 상태값. "기타(직접입력)" 선택 시엔 undefined로 두고 자유텍스트를 받는다. */
export type NodeStateValue = "O" | "X" | "BLOCKED" | "UNKNOWN";

export interface OnboardingOption {
  id: string;
  label: string;
  /** 보조 설명(선택). */
  hint?: string;
  /** 이 옵션을 고르면 확정되는 그래프 상태. "기타" 옵션은 생략(자유텍스트 입력으로 대체). */
  state?: NodeStateValue;
}

export interface OnboardingQuestion {
  /** 백엔드 graph.json 노드 id — 답변 전송 시 이 값을 그대로 쓴다. */
  nodeId: string;
  title: string;
  options: OnboardingOption[];
}

/** "기타(직접입력)" 옵션 — 모든 질문 공통. 선택 시 텍스트 입력 필드가 열린다. */
export const OTHER_OPTION_ID = "other";

const OTHER_OPTION: OnboardingOption = {
  id: OTHER_OPTION_ID,
  label: "기타 (직접 말씀해 주세요)",
};

export const QUESTIONS: OnboardingQuestion[] = [
  {
    nodeId: "proof_of_release",
    title: "수용(출소)증명서가\n있으신가요?",
    options: [
      { id: "yes", label: "네, 있어요", state: "O" },
      { id: "no", label: "아니요, 아직 없어요", state: "X" },
      OTHER_OPTION,
    ],
  },
  {
    nodeId: "shelter",
    title: "오늘 밤 주무실 곳이\n있으신가요?",
    options: [
      { id: "yes", label: "네, 있어요", state: "O" },
      { id: "no", label: "아니요, 없어요", state: "X", hint: "잘 곳부터 함께 찾아드려요." },
      OTHER_OPTION,
    ],
  },
  {
    nodeId: "address",
    title: "지금 지내시는 곳으로\n주민등록 주소지가 등록되어 있나요?",
    options: [
      { id: "yes", label: "네, 등록돼 있어요", state: "O" },
      { id: "no", label: "아니요, 안 돼 있어요", state: "X" },
      OTHER_OPTION,
    ],
  },
  {
    nodeId: "id_card",
    title: "신분증(주민등록증)이\n있으신가요?",
    options: [
      { id: "yes", label: "네, 있어요", state: "O" },
      { id: "no", label: "아니요, 없어요", state: "X" },
      OTHER_OPTION,
    ],
  },
  {
    nodeId: "bank_account",
    title: "본인 명의 통장을\n지금 쓸 수 있으신가요?",
    options: [
      { id: "yes", label: "네, 쓸 수 있어요", state: "O" },
      { id: "no", label: "아니요, 없어요", state: "X" },
      { id: "blocked", label: "있는데 정지됐어요", state: "BLOCKED", hint: "압류·분실 등으로 못 쓰는 경우" },
      OTHER_OPTION,
    ],
  },
  {
    nodeId: "phone",
    title: "본인 명의 휴대폰을\n지금 쓸 수 있으신가요?",
    options: [
      { id: "yes", label: "네, 쓸 수 있어요", state: "O" },
      { id: "no", label: "아니요, 없어요", state: "X" },
      { id: "blocked", label: "있는데 정지됐어요", state: "BLOCKED", hint: "요금 미납 등으로 못 쓰는 경우" },
      OTHER_OPTION,
    ],
  },
  {
    nodeId: "emergency_cash",
    title: "긴급복지 생계지원을\n이미 받고 계신가요?",
    options: [
      { id: "yes", label: "네, 받고 있어요", state: "O" },
      { id: "no", label: "아니요, 아직이에요", state: "X" },
      OTHER_OPTION,
    ],
  },
  {
    nodeId: "basic_livelihood",
    title: "기초생활보장 생계급여를\n이미 받고 계신가요?",
    options: [
      { id: "yes", label: "네, 받고 있어요", state: "O" },
      { id: "no", label: "아니요, 아직이에요", state: "X" },
      OTHER_OPTION,
    ],
  },
  {
    nodeId: "medical_aid",
    title: "의료급여나 건강보험을\n지금 쓸 수 있으신가요?",
    options: [
      { id: "yes", label: "네, 쓸 수 있어요", state: "O" },
      { id: "no", label: "아니요, 안 돼요", state: "X" },
      OTHER_OPTION,
    ],
  },
];
