// 할 일별 대화방 상태 (§6.1·§6.3).
// 할 일마다 대화방이 따로 있고, 닫아도 내용이 남는다. 저리터러시 사용자는 같은 안내를
// 여러 번 다시 읽기 때문에, 남지 않는 편이 더 나쁘다.
//
// 서버 연결은 아직 붙지 않았다. e8 세션의 계약 커밋 뒤에 스트리밍을 여기에 잇는다.
import { useCallback, useState } from "react";

import type { ChatMessage } from "../domain/chatMessage";

type Threads = Record<string, ChatMessage[]>;

export function useTaskThreads(initial: Threads = {}) {
  const [threads, setThreads] = useState<Threads>(initial);
  /** 지금 열려 있는 대화방. 닫혀 있으면 null. */
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const open = useCallback((taskId: string) => setOpenTaskId(taskId), []);
  const close = useCallback(() => setOpenTaskId(null), []);

  const send = useCallback(
    (text: string) => {
      if (!openTaskId) return;
      setThreads((prev) => {
        const room = prev[openTaskId] ?? [];
        return {
          ...prev,
          [openTaskId]: [
            ...room,
            { id: `${openTaskId}-${room.length + 1}`, role: "user", text },
          ],
        };
      });
    },
    [openTaskId],
  );

  // 경고로 막는 대신 지울 수 있게 한다 (§6.3-2).
  const clear = useCallback(() => {
    if (!openTaskId) return;
    setThreads((prev) => ({ ...prev, [openTaskId]: [] }));
  }, [openTaskId]);

  return {
    openTaskId,
    messages: openTaskId ? (threads[openTaskId] ?? []) : [],
    open,
    close,
    send,
    clear,
  };
}
