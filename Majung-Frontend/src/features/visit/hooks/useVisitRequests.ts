// 방문 요청 상태 (§7).
//
// 서버 연결은 아직 붙지 않았다. 지금은 보낸 요청을 기기 안에서만 들고 있으며,
// 담당자 앱이 붙으면 상태 갱신이 서버에서 내려온다.
import { useCallback, useState } from "react";

import { blockReason, type LimitReason, type VisitRequest } from "../domain/request";

type Draft = {
  firstChoice: string;
  secondChoice: string;
  readyDocs: readonly string[];
  note?: string;
};

export function useVisitRequests() {
  const [requests, setRequests] = useState<VisitRequest[]>([]);
  /**
   * 오늘 보낸 횟수. 하루 상한을 세는 데 쓴다 (§7.5).
   *
   * 지금은 앱을 켜 둔 동안만 세므로 날이 바뀌어도 0으로 돌아가지 않고, 앱을 다시 켜면 0이 된다.
   * **하루 상한의 실제 판정은 서버가 해야 한다.** 기기에서 세는 값은 우회할 수 있고, 날짜
   * 경계도 서버 시각으로 봐야 정확하다. 여기 값은 보내기 전에 미리 알려주는 용도다.
   */
  const [todaySent, setTodaySent] = useState(0);
  /** 지금 폼이 열려 있는 할 일. 닫혀 있으면 null. */
  const [formTaskId, setFormTaskId] = useState<string | null>(null);
  /** 상한에 걸려 막힌 이유. 막되 이유와 기존 요청을 함께 보여준다. */
  const [blocked, setBlocked] = useState<LimitReason | null>(null);

  const openForm = useCallback(
    (taskId: string) => {
      const reason = blockReason(taskId, todaySent, requests);
      if (reason) {
        setBlocked(reason);
        return;
      }
      setBlocked(null);
      setFormTaskId(taskId);
    },
    [requests, todaySent],
  );

  const closeForm = useCallback(() => setFormTaskId(null), []);
  const dismissBlocked = useCallback(() => setBlocked(null), []);

  const submit = useCallback(
    (draft: Draft) => {
      if (!formTaskId) return;
      setRequests((prev) => [
        ...prev,
        { id: `${formTaskId}-${prev.length + 1}`, taskId: formTaskId, status: "sent", ...draft },
      ]);
      setTodaySent((n) => n + 1);
      setFormTaskId(null);
    },
    [formTaskId],
  );

  const requestFor = useCallback(
    (taskId: string) => requests.find((r) => r.taskId === taskId) ?? null,
    [requests],
  );

  return {
    requests,
    requestFor,
    formTaskId,
    blocked,
    openForm,
    closeForm,
    dismissBlocked,
    submit,
  };
}
