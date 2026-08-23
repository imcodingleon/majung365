// 챗봇 UseCase — 메시지 상태 + SSE 스트림 소비. API는 shared/utils/api.ts만 경유.
import { useCallback, useRef, useState } from "react";

import type { CardData, RouteOut } from "@/shared/types";
import { ApiError, streamChat } from "@/shared/utils/api";

import {
  type ChatMessage,
  formatKoreanTime,
  GREETING,
  toHistory,
} from "../domain/message";

const GENERIC_ERROR = "지금 잠시 연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.";

let idSeq = 0;
const nextId = (): string => `m${(idSeq += 1)}`;

export interface UseChat {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  send: (text: string) => void;
}

export function useChat(): UseChat {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: nextId(), author: "bot", kind: "text", text: GREETING, at: formatKoreanTime(new Date()) },
  ]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 게이트 토큰 — 로컬 개발(게이트 비활성)에선 null로도 통과.
  const tokenRef = useRef<string | null>(null);
  const streamingRef = useRef(false);

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || streamingRef.current) return;

      setError(null);
      streamingRef.current = true;
      setStreaming(true);

      const now = (): string => formatKoreanTime(new Date());
      const history = toHistory(messages);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), author: "user", kind: "text", text, at: now() },
      ]);

      // 스트리밍 봇 텍스트 버블 — 절대값(누적 전체)으로 갱신해 업데이터를 멱등하게 유지.
      const botTextIdRef = { current: null as string | null };
      const botTextAcc = { current: "" };

      const finish = (): void => {
        streamingRef.current = false;
        setStreaming(false);
      };

      streamChat(
        { message: text, history, token: tokenRef.current },
        {
          onTriage: (routes: RouteOut[]) => {
            setMessages((prev) => [
              ...prev,
              { id: nextId(), author: "bot", kind: "triage", routes, at: now() },
            ]);
          },
          onText: (delta: string) => {
            botTextAcc.current += delta;
            if (!botTextIdRef.current) {
              const id = nextId();
              botTextIdRef.current = id;
              const full = botTextAcc.current;
              setMessages((prev) =>
                prev.some((m) => m.id === id)
                  ? prev
                  : [...prev, { id, author: "bot", kind: "text", text: full, at: now() }],
              );
            } else {
              const id = botTextIdRef.current;
              const full = botTextAcc.current;
              setMessages((prev) =>
                prev.map((m) => (m.id === id && m.kind === "text" ? { ...m, text: full } : m)),
              );
            }
          },
          onCard: (card: CardData) => {
            setMessages((prev) => [
              ...prev,
              { id: nextId(), author: "bot", kind: "card", card, at: now() },
            ]);
          },
          onError: (message: string) => {
            setError(message);
          },
          onDone: finish,
        },
      ).catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : GENERIC_ERROR);
        finish();
      });
    },
    [messages],
  );

  return { messages, streaming, error, send };
}
