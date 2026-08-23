// 개발 확인용 대화 표본. **실제 대화는 서버가 만든다.**
// 근거 3단계(§6.4)가 화면에서 어떻게 구분되는지 눈으로 확인하려고 둔다.
// 서버 연결이 붙으면 이 파일은 지운다.
import { SEARCH_NOTICE, SEARCH_RESULT_LEAD, type ChatMessage } from "./chatMessage";

export const DEMO_THREAD: readonly ChatMessage[] = [
  { id: "d1", role: "user", text: "주민등록증 다시 만들려면 뭘 가져가야 하나요" },
  {
    id: "d2",
    role: "assistant",
    text: "주민센터에서 다시 만들 수 있어요.\n사진 한 장을 가져가시면 돼요.",
    desk: { place: "주민센터", say: "주민등록증 재발급하러 왔어요" },
    // ① RAG — 확인한 근거 문서가 있을 때. 확인한 주체가 마중365라는 것이 드러나야 한다.
    evidence: { stage: "rag", org: "정부24 주민등록증 재발급 안내", checkedAt: "2026-08-23" },
    // ③ 연결 — 근거 단계와 무관하게 항상 붙는다. LLM이 아니라 서버가 붙인다.
    contact: { org: "정부민원안내콜센터", phone: "국번없이 110" },
  },
  { id: "d3", role: "user", text: "사진은 어디서 찍어요" },
  // ② 웹 검색 — 검색을 시작하기 전에 먼저 알린다. 로딩 안내를 겸한다.
  { id: "d4", role: "search-notice", text: SEARCH_NOTICE },
  {
    id: "d5",
    role: "assistant",
    text: `${SEARCH_RESULT_LEAD}\n주민센터 근처 사진관에서 찍으시면 돼요.`,
    evidence: { stage: "web", org: "정부24" },
    contact: { org: "정부민원안내콜센터", phone: "국번없이 110" },
  },
];
