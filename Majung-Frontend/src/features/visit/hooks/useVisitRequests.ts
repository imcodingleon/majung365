// 방문 요청 (§7).
//
// **서버가 실제로 받는다.** 담당자가 확인하고 확정하면 그 상태가 여기로 내려온다.
//
// 상한 판정도 서버가 한다(§7.5) — 기기에서 세는 값은 우회할 수 있고 날짜 경계도
// 서버 시각으로 봐야 정확하다. 화면의 셈은 **보내기 전에 미리 알려주는 용도**이며,
// 서버가 거부하면 그 이유를 그대로 보여준다.
import { useCallback, useEffect, useState } from "react";

import type { SharedAnswerInput, VisitResponse } from "@/shared/types";
import { ApiError, getVisits, postVisit } from "@/shared/utils/api";
import { loadToken } from "@/shared/utils/tokenStore";

import { blockReason, type LimitReason, type VisitRequest } from "../domain/request";
import { isoLabel, slotToIso } from "../domain/timeSlots";

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
    confirmation:
      v.status === "confirmed"
        ? {
            whenLabel: isoLabel(v.confirmed_at) || "정해진 시간",
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
        // 목록을 못 읽어도 새 요청을 보내는 데는 지장이 없다. 조용히 넘긴다.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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
    async (draft: Draft) => {
      if (!formTaskId) return;
      const token = await loadToken();
      if (!token) {
        setError("다시 로그인해 주세요.");
        return;
      }

      const first = slotToIso(draft.firstChoice);
      if (!first) {
        setError("가실 수 있는 때를 다시 골라 주세요.");
        return;
      }

      setSending(true);
      setError(null);
      try {
        const created = await postVisit(token, {
          route_id: formTaskId,
          preferred_at_1: first,
          preferred_at_2: slotToIso(draft.secondChoice),
          prepared_docs: [...draft.readyDocs],
          note: draft.note,
          // 동의하지 않았으면 답변도 동의 표시도 담기지 않는다. 서버가 짝을 검사하며,
          // 답변 없이 동의만 보내면 아무 기록도 남지 않는다.
          ...(draft.sharedAnswers?.length
            ? { shared_answers: [...draft.sharedAnswers], share_consented: true }
            : {}),
        });
        setRequests((prev) => [...prev, toRequest(created)]);
        setTodaySent((n) => n + 1);
        setFormTaskId(null);
      } catch (err) {
        // **상한에 걸린 것도 여기로 온다.** 서버가 이유를 문구로 주므로 그대로 낸다 (§7.5).
        setError(err instanceof ApiError ? err.message : "지금은 보내지 못했어요.");
      } finally {
        setSending(false);
      }
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
    sending,
    error,
    openForm,
    closeForm,
    dismissBlocked,
    submit,
  };
}
