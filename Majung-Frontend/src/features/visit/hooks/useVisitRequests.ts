// 방문 요청 (§7).
//
// **서버가 실제로 받는다.** 담당자가 확인하고 확정하면 그 상태가 여기로 내려온다.
//
// 상한 판정도 서버가 한다(§7.5) — 기기에서 세는 값은 우회할 수 있고 날짜 경계도
// 서버 시각으로 봐야 정확하다. 화면의 셈은 **보내기 전에 미리 알려주는 용도**이며,
// 서버가 거부하면 그 이유를 그대로 보여준다.
import { useCallback, useEffect, useState } from "react";

import type { SharedAnswerInput, VisitResponse } from "@/shared/types";
import { ApiError, cancelVisit, getVisits, postVisit } from "@/shared/utils/api";
import { loadToken } from "@/shared/utils/tokenStore";

import {
  blockReason,
  canCancel,
  countSentToday,
  type LimitReason,
  type VisitRequest,
} from "../domain/request";
import { isoLabel } from "../domain/timeSlots";

type Draft = {
  firstChoice: string;
  secondChoice: string;
  readyDocs: readonly string[];
  note?: string;
  sharedAnswers?: readonly SharedAnswerInput[];
};

/** 서버가 준 요청을 화면 타입으로. 확정되면 만날 사람과 장소가 함께 온다 (§7.1). */
function toRequest(v: VisitResponse): VisitRequest {
  return {
    id: v.id,
    taskId: v.route_id,
    status: v.status,
    firstChoice: isoLabel(v.preferred_at_1),
    secondChoice: isoLabel(v.preferred_at_2),
    readyDocs: v.prepared_docs,
    note: v.note || undefined,
    createdAt: v.created_at,
    confirmation:
      v.status === "confirmed"
        ? {
            // **`confirmed_for`다.** `confirmed_at`은 담당자가 확정을 누른 시각이라
            // 그것을 내면 새벽에 만나자는 안내가 나간다.
            whenLabel: isoLabel(v.confirmed_for),
            staffName: v.staff_name,
            place: v.meeting_place,
          }
        : undefined,
    proposedTime: v.proposed_at ? isoLabel(v.proposed_at) : undefined,
    cancelReason: v.cancel_reason || undefined,
  };
}

export function useVisitRequests() {
  const [requests, setRequests] = useState<VisitRequest[]>([]);
  /** 지금 폼이 열려 있는 할 일. 닫혀 있으면 null. */
  const [formTaskId, setFormTaskId] = useState<string | null>(null);
  /** 상한에 걸려 막힌 이유. 막되 이유와 기존 요청을 함께 보여준다. */
  const [blocked, setBlocked] = useState<LimitReason | null>(null);
  /** 보내는 중. 두 번 누르는 것을 막는다. */
  const [sending, setSending] = useState(false);
  /** 서버가 준 실패 문구. 상한에 걸린 것도 여기로 온다. */
  const [error, setError] = useState<string | null>(null);

  // 보낸 요청을 서버에서 읽어 온다. 담당자가 확정하면 그 상태가 여기로 내려온다.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const token = await loadToken();
      if (!token) return;
      try {
        const found = await getVisits(token);
        if (alive) setRequests(found.map(toRequest));
      } catch {
        // **조용히 넘기지 않는다.** 목록을 못 읽으면 화면이 중복도 미확정 건수도
        // 못 보므로, 이미 보낸 항목에 한 번 더 보내게 된다. 막는 것은 서버뿐이고
        // 사용자는 왜 막혔는지 모른다.
        if (alive) setError("보낸 요청을 불러오지 못했어요. 화면을 다시 열어 주세요.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const openForm = useCallback(
    (taskId: string) => {
      const reason = blockReason(taskId, countSentToday(requests), requests);
      if (reason) {
        setBlocked(reason);
        return;
      }
      setBlocked(null);
      setFormTaskId(taskId);
    },
    [requests],
  );

  const closeForm = useCallback(() => {
    setFormTaskId(null);
    // **앞선 실패 문구를 다음 화면까지 끌고 가지 않는다.** 상한에 걸려 거절당한 뒤
    // 다른 항목의 알림 화면을 열면, 아무것도 보내지 않았는데 그 문구가 보내기 단추
    // 위에 그대로 떠 있었다.
    setError(null);
  }, []);
  const dismissBlocked = useCallback(() => setBlocked(null), []);

  const submit = useCallback(
    async (draft: Draft) => {
      if (!formTaskId || sending) return;
      // **잠금을 토큰 읽기 앞에 건다.** 뒤에 두면 토큰을 읽는 동안 버튼이 살아 있어,
      // 한 번 더 누르면 방문 요청이 두 건 만들어진다.
      setSending(true);
      setError(null);
      const token = await loadToken();
      if (!token) {
        setError("다시 로그인해 주세요.");
        setSending(false);
        return;
      }

      // **화면이 이미 시각을 만들어 넘긴다.** 예전에는 "2026-08-25-am" 같은 슬롯 id를
      // 받아 여기서 시각으로 바꿨는데, 오전을 10시로 대신 정하는 규칙이 이 자리에
      // 숨어 있었다. 이제 사용자가 고른 시각이 그대로 온다.
      const first = draft.firstChoice;
      if (!first) {
        setError("가실 수 있는 때를 다시 골라 주세요.");
        setSending(false);
        return;
      }

      try {
        const created = await postVisit(token, {
          route_id: formTaskId,
          preferred_at_1: first,
          preferred_at_2: draft.secondChoice || null,
          prepared_docs: [...draft.readyDocs],
          note: draft.note,
          // 동의하지 않았으면 답변도 동의 표시도 담기지 않는다. 서버가 짝을 검사하며,
          // 답변 없이 동의만 보내면 아무 기록도 남지 않는다.
          ...(draft.sharedAnswers?.length
            ? { shared_answers: [...draft.sharedAnswers], share_consented: true }
            : {}),
        });
        // **앞에 붙인다.** 서버가 최신순으로 주고 `requestFor`가 처음 맞는 것을 쓰므로,
        // 뒤에 붙이면 같은 할 일의 옛 요청(취소된 것 따위)이 대신 보인다.
        setRequests((prev) => [toRequest(created), ...prev]);
        setFormTaskId(null);
      } catch (err) {
        // **상한에 걸린 것도 여기로 온다.** 서버가 이유를 문구로 주므로 그대로 낸다 (§7.5).
        setError(err instanceof ApiError ? err.message : "지금은 보내지 못했어요.");
      } finally {
        setSending(false);
      }
    },
    [formTaskId, sending],
  );

  /**
   * 보낸 요청을 물린다.
   *
   * **목록에서 지우지 않고 취소된 상태로 남긴다.** 지우면 사용자는 취소가 됐는지
   * 안 됐는지 알 수 없고, 화면에 이미 "다시 보내기"가 붙는 자리가 있다.
   */
  const cancel = useCallback(
    async (id: string): Promise<boolean> => {
      const target = requests.find((r) => r.id === id);
      if (!target || !canCancel(target.status)) return false;

      const token = await loadToken();
      if (!token) {
        setError("다시 로그인해 주세요.");
        return false;
      }
      setError(null);
      try {
        const updated = await cancelVisit(token, id);
        setRequests((prev) => prev.map((r) => (r.id === id ? toRequest(updated) : r)));
        return true;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "지금은 물리지 못했어요.");
        return false;
      }
    },
    [requests],
  );

  /** 그 할 일의 가장 최근 요청. **서버가 최신순으로 주므로 처음 맞는 것이 최신이다.** */
  const requestFor = useCallback(
    (taskId: string) => requests.find((r) => r.taskId === taskId) ?? null,
    [requests],
  );

  return {
    requests,
    requestFor,
    cancel,
    formTaskId,
    blocked,
    sending,
    error,
    openForm,
    closeForm,
    dismissBlocked,
    submit,
  };
}
