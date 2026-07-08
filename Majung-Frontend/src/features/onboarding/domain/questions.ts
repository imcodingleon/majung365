// 온보딩 구조화 질문 (CAP-1a). 순수 데이터.
// ⚠️ 질문 내용은 임시 — 7/8 공단 인터뷰 후 확정(SPEC). 6영역 상황 체크에 맞춘 초안.

export interface OnboardingOption {
  id: string;
  label: string;
  /** 보조 설명(선택). */
  hint?: string;
}

export interface OnboardingQuestion {
  id: string;
  title: string;
  options: OnboardingOption[];
}

export const QUESTIONS: OnboardingQuestion[] = [
  {
    id: "housing",
    title: "오늘 주무실 곳이\n있으신가요?",
    options: [
      { id: "yes", label: "네, 있어요" },
      { id: "no", label: "아니요, 없어요" },
      { id: "help", label: "도움이 필요해요", hint: "긴급 쉼터 안내를 받을 수 있습니다." },
    ],
  },
  {
    id: "identity",
    title: "신분증·통장·휴대폰을\n쓸 수 있으신가요?",
    options: [
      { id: "all", label: "다 있어요" },
      { id: "some", label: "일부만 있어요" },
      { id: "none", label: "다시 만들어야 해요", hint: "재발급 절차를 함께 안내해 드려요." },
    ],
  },
  {
    id: "welfare",
    title: "당장 생활비나 식사는\n해결되시나요?",
    options: [
      { id: "ok", label: "당분간 괜찮아요" },
      { id: "few", label: "며칠은 버틸 수 있어요" },
      { id: "urgent", label: "지금 많이 급해요", hint: "긴급복지 지원을 우선 안내해 드려요." },
    ],
  },
  {
    id: "employment",
    title: "일자리를\n찾고 계신가요?",
    options: [
      { id: "have", label: "이미 일하고 있어요" },
      { id: "soon", label: "곧 찾아보려고 해요" },
      { id: "help", label: "도움이 필요해요", hint: "취업 지원 제도를 안내해 드려요." },
    ],
  },
  {
    id: "health",
    title: "몸이나 마음 건강은\n어떠세요?",
    options: [
      { id: "ok", label: "괜찮은 편이에요" },
      { id: "hard", label: "조금 힘들어요" },
      { id: "counsel", label: "상담이 필요해요", hint: "가까운 상담 창구를 연결해 드려요." },
    ],
  },
];
