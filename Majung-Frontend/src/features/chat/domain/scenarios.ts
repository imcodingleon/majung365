// 데스크톱 챗 시나리오 프리셋 — 디자이너 시안 majung365_ai.html 원문.
// 정적 데이터만(Domain). 클릭 시 prompt가 그대로 백엔드 SSE(streamChat)로 전송된다.
// ⚠️ 시안의 브라우저→api.anthropic.com 직접 호출은 보안(키 노출) 위반이라 이식하지 않음.

export interface ChatScenario {
  id: string;
  group: string;
  name: string;
  desc: string;
  tags: readonly string[];
  prompt: string;
}

export const SCENARIOS: readonly ChatScenario[] = [
  {
    id: "no-family-no-shelter",
    group: "출소 첫날",
    name: "무연고 출소 · 잘 곳 없음",
    desc: "오늘 출소했는데 갈 곳도 없고 돈도 거의 없어요",
    tags: ["긴급", "주거", "생계"],
    prompt:
      "오늘 출소했는데 갈 곳도 없고 돈도 거의 없어요. 5만원밖에 없고 가족도 없어요. 뭐부터 해야 할지 모르겠어요.",
  },
  {
    id: "identity-blocked",
    group: "출소 첫날",
    name: "신분증·인증 막힘",
    desc: "폰이 안 열려요. 공동인증서가 어떻게 된 건지 모르겠어요",
    tags: ["신분증", "인증"],
    prompt:
      "폰이 안 열려요. 공동인증서가 어떻게 된 건지 모르겠고 주민등록증도 없어요. 뭐가 어떻게 된 건지 알려주세요.",
  },
  {
    id: "job-start",
    group: "출소 첫날",
    name: "취업 준비 시작",
    desc: "전과가 있어도 일할 수 있는 곳이 있을까요?",
    tags: ["취업", "일자리"],
    prompt: "전과가 있어도 취업할 수 있는 방법이 있을까요? 어디서부터 시작해야 할지 막막해요.",
  },
  {
    id: "emergency-welfare",
    group: "지원제도",
    name: "긴급복지 신청 방법",
    desc: "당장 생활비가 없는데 정부 지원을 받을 수 있나요?",
    tags: ["긴급", "복지"],
    prompt: "당장 생활비가 없는데 정부 지원을 받을 수 있나요? 어떻게 신청하는지 모르겠어요.",
  },
  {
    id: "mind-hard",
    group: "지원제도",
    name: "마음이 힘들어요",
    desc: "나와도 아무것도 안 되는 것 같아서 다 포기하고 싶어요",
    tags: ["심리", "상담"],
    prompt:
      "나와도 아무것도 안 되는 것 같아서 다 포기하고 싶어요. 아무도 없고 뭘 해도 안 될 것 같아요.",
  },
];
