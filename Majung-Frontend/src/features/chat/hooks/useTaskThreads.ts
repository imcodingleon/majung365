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
import { useCallback, useEffect, useRef, useState } from "react";

import type { CardData, Turn, EvidenceEvent } from "@/shared/types";
import { ApiError, deleteChatHistory, getChatHistory, streamChat } from "@/shared/utils/api";
import { loadToken } from "@/shared/utils/tokenStore";

import { SEARCH_NOTICE, type ChatMessage } from "../domain/chatMessage";

type Threads = Record<string, ChatMessage[]>;

/**
 * 배지에 적을 출처.
 *
 * **§6.4가 요구하는 것은 출처 기관명인데 서버가 아직 그 필드를 주지 않는다.**
 * 그때까지 어느 갈래인지만 밝힌다 — 빈 문자열을 두면 배지에 빈 줄이 생긴다.
 */
function sourceLabel(stage: EvidenceEvent["stage"]): string {
  return stage === "web" ? "인터넷 검색" : "마중365가 모아둔 자료";
}

export function useTaskThreads(initial: Threads = {}) {
  const [threads, setThreads] = useState<Threads>(initial);
  /** 지금 열려 있는 대화방. 닫혀 있으면 null. */
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  /** 답변을 기다리는 중인 방. 입력을 잠근다. */
  const [busyId, setBusyId] = useState<string | null>(null);
  /**
   * 방마다 AI가 제안한 다음 질문 (§6.1).
   *
   * **새 답변이 시작되면 그 방의 앞 제안을 버린다.** 쌓아 두면 지난 답변에 딸린
   * 제안이 새 답변 아래에 그대로 남아, 무엇에 대한 제안인지 알 수 없게 된다.
   */
  const [suggestions, setSuggestions] = useState<Record<string, readonly string[]>>({});
  /** 지난 대화를 이미 불러온 방. 열 때마다 다시 부르지 않는다. */
  const loaded = useRef<Set<string>>(new Set());
  /** 열려 있는 방의 스트림. 방을 닫거나 새로 보내면 끊는다. */
  const abort = useRef<AbortController | null>(null);
  /**
   * 세션 토큰. **미리 읽어 둔다.**
   *
   * 보낼 때 읽으면 `send`를 비동기로 만들어야 하는데, 그러면 낙관적 말풍선이 한 박자
   * 늦게 뜬다. 토큰은 앱을 켤 때 이미 정해져 있으므로 미리 담아 둔다.
   */
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadToken().then((t) => {
      if (alive) tokenRef.current = t;
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 대화방을 연다. **저장된 지난 대화를 함께 불러온다** (§6.3).
   *
   * 예선에서는 대화를 남기지 않았는데, 남지 않으면 어제 받은 안내가 사라져서
   * 본선에서 뒤집었다. 서버가 보관만 하고 화면이 안 읽으면 뒤집은 뜻이 없다.
   *
   * **이미 화면에 있는 방은 다시 안 불러온다.** 열 때마다 부르면 방금 나눈 대화가
   * 서버 사본으로 덮이고, 스트리밍 중이던 답이 사라진다.
   */
  const open = useCallback(
    (taskId: string) => {
      setOpenTaskId(taskId);
      if (loaded.current.has(taskId)) return;
      void (async () => {
        const token = await loadToken();
        if (!token) return;
        try {
          const past = await getChatHistory(token, taskId);
          // **성공한 뒤에 표시한다.** 먼저 표시하면 한 번 실패한 방은 앱을 다시 켜기
          // 전까지 지난 대화를 영영 못 불러온다.
          loaded.current.add(taskId);
          if (past.length === 0) return;
          // **마지막 답변에 딸린 제안을 되살린다.** 저장하기로 한 이유가 여기 있다 —
          // 어제 받은 안내를 다시 열었을 때 이어서 물을 것도 함께 있어야 한다.
          const lastReply = [...past].reverse().find((t) => t.role === "assistant");
          if (lastReply?.suggestions?.length) {
            const restored = lastReply.suggestions;
            setSuggestions((prev) => (prev[taskId]?.length ? prev : { ...prev, [taskId]: restored }));
          }
          setThreads((prev) => {
            // 그 사이에 말을 걸었으면 덮지 않는다.
            if ((prev[taskId] ?? []).length > 0) return prev;
            return {
              ...prev,
              [taskId]: past.map((turn, i) => ({
                id: `${taskId}-past-${i}`,
                role: turn.role,
                text: turn.content,
                // 서버가 담아 보낸 시각을 그대로 쓴다. 지난 대화를 다시 열었을 때
                // 언제 오간 말인지 보여야 한다 (2026-08-31 시안).
                at: turn.at,
              })),
            };
          });
        } catch {
          // 못 불러와도 새 대화는 할 수 있다. 조용히 넘긴다.
        }
      })();
    },
    [],
  );

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

      // **묻기 시작하면 앞의 제안부터 버린다.** 답을 기다리는 내내 지난 제안이
      // 남아 있으면, 방금 누른 그 문장이 아직 칩으로 보인다.
      setSuggestions((prev) => ({ ...prev, [taskId]: [] }));

      const room = threads[taskId] ?? [];
      const seq = room.length + 1;
      append(taskId, {
        id: `${taskId}-${seq}`,
        role: "user",
        text,
        at: new Date().toISOString(),
      });

      // 서버는 대화 히스토리를 요청에 함께 받는다. 안내 문구(사전 고지)는 대화가 아니라
      // 화면 장치이므로 빼고 보낸다.
      const history: Turn[] = room
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.text,
        }));

      const replyId = `${taskId}-${seq + 1}`;
      /**
       * 답이 오기 시작한 때. **한 번 정하고 바꾸지 않는다.**
       *
       * 델타가 올 때마다 다시 재면 말풍선의 시각이 글자가 늘어나는 내내 흔들린다.
       */
      const replyAt = new Date().toISOString();
      let streamed = "";
      /** 카드가 한 장이라도 왔는지. 본문이 비어도 카드가 있으면 빈 응답이 아니다. */
      let gotCard = false;
      let started = false;
      /**
       * 서버가 알려준 근거 단계. 답변 텍스트보다 먼저 온다 (§6.4).
       *
       * **모를 때는 비워 둔다.** 예전 기본값이 `"confirmed"`여서, 서버가 근거 프레임을
       * 보내지 않는 경로에서는 근거가 없는데도 "확인한 자료를 참고했어요"가 붙었다.
       * 확실성을 모를 때 가장 강한 쪽으로 기우는 것은 이 배지를 둔 이유에 반한다.
       */
      let stage: EvidenceEvent["stage"] | null = null;

      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setBusyId(taskId);

      void streamChat(
        // 방(taskId)이 곧 지원 항목 코드다. 어느 카드에서 연 대화인지 서버가 알아야
        // 근거를 그쪽부터 훑는다.
        //
        // **토큰을 함께 보낸다.** 서버는 이 값으로 누구인지 가려 대화를 저장하고(§6.3),
        // 모르면 답만 하고 흘려보낸다 — 오류가 나지 않아 오래 빠져 있었다. 상담 탭이
        // 계속 비어 있던 이유가 이것이다.
        { message: text, history, route_id: taskId, token: tokenRef.current },
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
                    {
                      id: replyId,
                      role: "assistant",
                      text: streamed,
                      at: replyAt,
                      streaming: true,
                      // 어디서 온 답인지를 말풍선이 직접 드러낸다 (§6.4).
                      // 근거를 모르면 아무 말도 하지 않는다 — 없는 근거를 있다고 하지 않는다.
                      ...(stage
                        ? {
                            evidence: {
                              stage: stage === "web" ? ("web" as const) : ("rag" as const),
                              org: sourceLabel(stage),
                            },
                          }
                        : {}),
                    },
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
          // **답변보다 먼저 온다** (§6.4). 웹 검색으로 넘어가면 그 사실을 답변 앞에
          // 내야 한다 — 나중에 "인터넷 정보였습니다"라고 덧붙이면 이미 사실로 받아들인
          // 뒤다. 사전 고지는 로딩 안내도 겸한다(검색이 붙으면 응답이 느려진다).
          onEvidence: (ev) => {
            stage = ev.stage;
            // **이미 만들어진 말풍선의 배지를 고쳐 준다.** 근거가 텍스트보다 먼저 오는
            // 것이 정상이지만, 늦게 오면 배지가 "확인한 자료"로 굳은 채 남는다.
            // 인터넷에서 찾은 답에 확인된 자료라고 붙는 것은 §6.4가 막으려던 바로 그것이다.
            if (started) {
              setThreads((prev) => ({
                ...prev,
                [taskId]: (prev[taskId] ?? []).map((m) =>
                  m.id === replyId && m.role === "assistant"
                    ? {
                        ...m,
                        evidence: {
                          stage: ev.stage === "web" ? "web" : "rag",
                          org: sourceLabel(ev.stage),
                        },
                      }
                    : m,
                ),
              }));
            }
            if (ev.stage === "web") {
              // **먼저 알리는 것이 핵심이다** (§6.4 ②단계). 서버가 문구를 비워 보내면
              // 고지가 통째로 사라지고 답변만 흘러나온 뒤 배지가 뒤따랐다 — 신호가
              // 정보 뒤로 간다. 이 문장은 대기 안내도 겸하므로 비면 대기 화면도 빈다.
              const notice = ev.notice?.trim() || SEARCH_NOTICE;
              append(taskId, { id: `${replyId}-notice`, role: "search-notice", text: notice, at: new Date().toISOString() });
            }
          },
          // **카드는 답변에 붙는다. 말풍선을 따로 세우지 않는다.**
          //
          // 예전에는 카드마다 별도 말풍선을 만들었는데, 값이 KB에서 그대로 온
          // 고정 서식이라 대화 가운데에 안내문이 끼어든 것처럼 읽혔다. 답변 아래에
          // 붙여 두면 무엇에 대한 안내인지가 분명해진다.
          onCard: (card) => {
            gotCard = true;
            setThreads((prev) => {
              const current = prev[taskId] ?? [];
              const attached = current.map((m) =>
                m.id === replyId && m.role === "assistant"
                  ? { ...m, cards: [...(m.cards ?? []), card] }
                  : m,
              );
              // **본문 없이 카드만 오는 경우가 있다.** 모델이 항목은 맞혔는데
              // 질문 유형을 다르게 판정하면 본문이 비어 온다. 그때는 붙일 말풍선이
              // 없으므로 여기서 하나 세운다.
              if (started) return { ...prev, [taskId]: attached };
              started = true;
              return {
                ...prev,
                [taskId]: [
                  ...current,
                  {
                    id: replyId,
                    role: "assistant",
                    text: "",
                    at: replyAt,
                    cards: [card],
                    ...(stage
                      ? {
                          evidence: {
                            stage: stage === "web" ? ("web" as const) : ("rag" as const),
                            org: sourceLabel(stage),
                          },
                        }
                      : {}),
                  },
                ],
              };
            });
          },
          // **답변 본문이 다 흐른 뒤에 온다** (`done` 직전). 그 답을 보고 이어서
          // 물을 것이 정해지므로 순서가 뒤집히면 제안이 앞 답변을 가리킨다.
          onSuggestions: (questions) => {
            setSuggestions((prev) => ({ ...prev, [taskId]: questions }));
          },
          onError: (message) => {
            append(taskId, { id: `${replyId}-err`, role: "assistant", text: message, at: new Date().toISOString() });
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
                at: new Date().toISOString(),
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
        append(taskId, { id: `${replyId}-err`, role: "assistant", text: message, at: new Date().toISOString() });
        setBusyId(null);
      });
    },
    [append, openTaskId, threads],
  );

  /**
   * 이 대화를 지운다 (§6.3-2).
   *
   * **서버에서도 지운다.** 화면에서만 비우면 앱을 다시 켤 때 되살아나고, 사용자는
   * 지웠다고 믿은 것이 남아 있는 상태가 된다. 자동 로그인 상태에서 기기를 잡은
   * 사람이 읽을 수 있는 것이 이 대화이므로, 지운다고 했으면 실제로 지워져야 한다.
   */
  const clear = useCallback(() => {
    if (!openTaskId) return;
    const taskId = openTaskId;
    abort.current?.abort();
    setBusyId(null);
    setThreads((prev) => ({ ...prev, [taskId]: [] }));
    // **제안도 함께 비운다.** 대화를 지웠는데 칩만 남으면, 지워졌다고 믿은 것의
    // 자취가 화면에 그대로 있는 셈이다.
    setSuggestions((prev) => ({ ...prev, [taskId]: [] }));
    void (async () => {
      const token = await loadToken();
      if (!token) return;
      try {
        await deleteChatHistory(token, taskId);
      } catch {
        // 서버에서 못 지웠어도 화면은 비운 채로 둔다. 되살려 보이면 더 혼란스럽다.
        // **대신 다시 불러올 길을 연다.** `loaded`에서 빼지 않으면 `open`이 곧바로
        // 돌아가 버려(위쪽 `loaded.current.has` 검사), 같은 실행 안에서는 서버 사본이
        // 영영 오지 않는다. 사용자는 지워졌다고 믿지만 서버에는 남고, 다시 지울
        // 기회도 오지 않는다 — CLAUDE.md가 "삭제는 즉시 처리한다"로 못 박은 자리다.
        loaded.current.delete(taskId);
      }
    })();
  }, [openTaskId]);

  return {
    /** 할 일별 대화 전체. **상담 탭의 목록이 쓴다** — 어느 할 일에서 물었는지 알아야 한다. */
    threads,
    openTaskId,
    messages: openTaskId ? (threads[openTaskId] ?? []) : [],
    /** 열린 방에서 AI가 제안한 다음 질문. 못 만들었으면 비어 있다. */
    suggestions: openTaskId ? (suggestions[openTaskId] ?? []) : [],
    busy: busyId !== null && busyId === openTaskId,
    open,
    close,
    send,
    clear,
  };
}
