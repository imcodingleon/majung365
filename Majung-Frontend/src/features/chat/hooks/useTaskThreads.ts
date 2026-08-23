// 할 일별 대화방 (§6.1·§6.3).
//
// 할 일마다 대화방이 따로 있고, 닫아도 내용이 남는다. 저리터러시 사용자는 같은 안내를
// 여러 번 다시 읽기 때문에, 남지 않는 편이 더 나쁘다.
//
// **아직 기기 안에만 남는다.** §6.3은 서버에 암호화 저장으로 확정했지만 조회·삭제 API가
// 아직 없다. 붙으면 이 훅이 서버에서 불러오고 지운다.
//
// **방(routeId)을 서버로 보낸다.** 어느 할 일 카드에서 연 대화인지 알아야 챗봇이 그
// 항목의 근거부터 훑는다. triage를 건너뛰는 것은 아니고 순서만 바뀐다 (2026-08-23).
import { useCallback, useRef, useState } from "react";

import type { CardData, Turn } from "@/shared/types";
import { ApiError, streamChat } from "@/shared/utils/api";

import type { ChatMessage } from "../domain/chatMessage";

type Threads = Record<string, ChatMessage[]>;

/** 서버가 준 제도 카드를 말풍선에 담는다. 카드 전용 렌더는 §4.1 결과 카드 작업이다. */
function cardToMessage(id: string, card: CardData): ChatMessage {
  // 창구 안내(desk)로 옮기지 않는다. §6.4의 창구 안내는 "주민센터에 가서 '전입신고
  // 하러 왔어요'라고 말하면 돼요" 형태인데, KB의 next_step은 그런 짧은 대사가 아니라
  // 안내 문장이다. 그대로 넣으면 문장이 이중으로 감싸여 읽기 어려워진다.
  const lines = [card.summary_easy, card.where ? `어디서: ${card.where}` : "", card.next_step]
    .filter(Boolean)
    .join("\n");

  return {
    id,
    role: "assistant",
    text: lines,
    // 서버가 KB에서 찾아준 것이므로 확인된 자료다 (§6.4 ①단계).
    //
    // ⚠️ org에 제도명이 들어간다. §6.4가 요구하는 것은 **출처 기관명**이고 응답에 아직
    // 그 필드가 없다. 계약에 기관명과 확인 날짜(fetched_at)가 실리면 여기를 바꾼다.
    evidence: { stage: "rag", org: card.name },
  };
}

export function useTaskThreads(initial: Threads = {}) {
  const [threads, setThreads] = useState<Threads>(initial);
  /** 지금 열려 있는 대화방. 닫혀 있으면 null. */
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  /** 답변을 기다리는 중인 방. 입력을 잠근다. */
  const [busyId, setBusyId] = useState<string | null>(null);
  /** 열려 있는 방의 스트림. 방을 닫거나 새로 보내면 끊는다. */
  const abort = useRef<AbortController | null>(null);

  const open = useCallback((taskId: string) => setOpenTaskId(taskId), []);

  const close = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setBusyId(null);
    setOpenTaskId(null);
  }, []);

  const append = useCallback((taskId: string, message: ChatMessage) => {
    setThreads((prev) => ({ ...prev, [taskId]: [...(prev[taskId] ?? []), message] }));
  }, []);

  const send = useCallback(
    (text: string) => {
      const taskId = openTaskId;
      if (!taskId) return;

      const room = threads[taskId] ?? [];
      const seq = room.length + 1;
      append(taskId, { id: `${taskId}-${seq}`, role: "user", text });

      // 서버는 대화 히스토리를 요청에 함께 받는다. 안내 문구(사전 고지)는 대화가 아니라
      // 화면 장치이므로 빼고 보낸다.
      const history: Turn[] = room
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.text,
        }));

      const replyId = `${taskId}-${seq + 1}`;
      let streamed = "";
      /** 카드가 한 장이라도 왔는지. 본문이 비어도 카드가 있으면 빈 응답이 아니다. */
      let gotCard = false;
      let started = false;

      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setBusyId(taskId);

      void streamChat(
        // 방(taskId)이 곧 지원 항목 코드다. 어느 카드에서 연 대화인지 서버가 알아야
        // 근거를 그쪽부터 훑는다.
        { message: text, history, route_id: taskId },
        {
          onText: (delta) => {
            streamed += delta;
            setThreads((prev) => {
              const current = prev[taskId] ?? [];
              if (!started) {
                started = true;
                return {
                  ...prev,
                  [taskId]: [
                    ...current,
                    { id: replyId, role: "assistant", text: streamed, streaming: true },
                  ],
                };
              }
              return {
                ...prev,
                [taskId]: current.map((m) =>
                  m.id === replyId && m.role === "assistant" ? { ...m, text: streamed } : m,
                ),
              };
            });
          },
          onCard: (card) => {
            gotCard = true;
            append(taskId, cardToMessage(`${replyId}-card`, card));
          },
          onError: (message) => {
            append(taskId, { id: `${replyId}-err`, role: "assistant", text: message });
          },
          onDone: () => {
            // **답변도 카드도 없이 끝나는 응답이 있다.** 모델이 항목은 맞혔는데 질문 유형을
            // 다르게 판정하면 카드가 통째로 빠지고 본문도 비어 온다(backend 확인, 2026-08-23).
            //
            // 그때 화면에는 사용자가 보낸 말만 남는다. **저리터러시 사용자는 화면이 비면
            // 자기가 잘못 눌렀다고 생각한다.** 빈 채로 두지 않고 못 찾았다고 말한다.
            if (!streamed.trim() && !gotCard) {
              append(taskId, {
                id: `${replyId}-empty`,
                role: "assistant",
                text: "지금은 답을 찾지 못했어요.\n사람에게 물어보시는 편이 빠를 수 있어요.",
              });
            }
            setThreads((prev) => ({
              ...prev,
              [taskId]: (prev[taskId] ?? []).map((m) =>
                m.id === replyId && m.role === "assistant" ? { ...m, streaming: false } : m,
              ),
            }));
            setBusyId(null);
          },
        },
        controller.signal,
      ).catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // 서버가 사용자용 문구를 주면 그대로 쓴다. 그 밖의 경우는 기본 문구다.
        const message =
          err instanceof ApiError
            ? err.message
            : "지금 답을 받지 못했어요. 잠시 뒤에 다시 물어봐 주세요.";
        append(taskId, { id: `${replyId}-err`, role: "assistant", text: message });
        setBusyId(null);
      });
    },
    [append, openTaskId, threads],
  );

  // 경고로 막는 대신 지울 수 있게 한다 (§6.3-2).
  const clear = useCallback(() => {
    if (!openTaskId) return;
    abort.current?.abort();
    setBusyId(null);
    setThreads((prev) => ({ ...prev, [openTaskId]: [] }));
  }, [openTaskId]);

  return {
    openTaskId,
    messages: openTaskId ? (threads[openTaskId] ?? []) : [],
    busy: busyId !== null && busyId === openTaskId,
    open,
    close,
    send,
    clear,
  };
}
