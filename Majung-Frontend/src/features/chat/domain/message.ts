// 챗봇 도메인 — 메시지 모델과 순수 변환 규칙. React/API import 금지.
import type { AreaOut, CardData, Turn } from "@/shared/types";

/** 화면에 쌓이는 대화 항목. 봇 응답은 text·triage·card 세 종류로 나뉜다. */
export type ChatMessage =
  | { id: string; author: "user"; kind: "text"; text: string; at: string }
  | { id: string; author: "bot"; kind: "text"; text: string; at: string }
  | { id: string; author: "bot"; kind: "triage"; areas: AreaOut[]; at: string }
  | { id: string; author: "bot"; kind: "card"; card: CardData; at: string };

/** "오전 10:02" 형식(한국어 12시간제). */
export function formatKoreanTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${h12}:${m.toString().padStart(2, "0")}`;
}

/** 텍스트 메시지만 백엔드 히스토리(Turn)로 변환. triage·card는 제외. */
export function toHistory(messages: ChatMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const msg of messages) {
    if (msg.kind !== "text") continue;
    turns.push({ role: msg.author === "user" ? "user" : "assistant", content: msg.text });
  }
  return turns;
}

/** 첫 인사말 (Figma 2:1790 원문). */
export const GREETING =
  "안녕하세요! 마중365 AI 챗봇입니다.\n오늘 하루는 어떻게 보내셨나요? 마음이 조금 무거우시다면 언제든 제가 곁에서 도와드릴게요.";

/** 프리셋 빠른 질문 칩 (Figma 2:1790). */
export const PRESET_CHIPS: readonly string[] = [
  "오늘 뭐 해야 해요?",
  "근처 센터 어디예요?",
  "긴급복지 신청 방법",
];
