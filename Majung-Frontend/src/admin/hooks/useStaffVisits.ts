// 담당자가 보는 방문 요청 목록 (§8.1).
//
// **다른 기관 요청은 아예 오지 않는다.** 서버가 거르는 것이지 화면이 거르는 것이 아니다.
// 그래서 여기에 기관 필터가 없다 — 있으면 "화면이 거른다"고 오해하게 된다.
import { useCallback, useEffect, useState } from "react";

import type { VisitStatus } from "@/shared/types/visit";
import { ApiError, getStaffVisits, patchStaffVisit } from "@/shared/utils/api";

import { toStaffRequest } from "../domain/fromServer";
import type { StaffRequest } from "../domain/staffRequest";

type State = {
  requests: readonly StaffRequest[];
  loading: boolean;
  error: string | null;
};

export function useStaffVisits(token: string | null) {
  const [state, setState] = useState<State>({ requests: [], loading: false, error: null });

  const load = useCallback(async () => {
    if (!token) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const found = await getStaffVisits(token);
      setState({ requests: found.map(toStaffRequest), loading: false, error: null });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof ApiError ? err.message : "요청 목록을 불러오지 못했어요.",
      }));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 상태를 바꾸고 그 한 건만 갈아 끼운다.
   *
   * **목록 전체를 다시 부르지 않는다.** 담당자가 확인 버튼을 누른 순간 목록이 새로
     그려지면 보고 있던 자리를 잃는다.
   */
  const act = useCallback(
    async (
      id: string,
      status: VisitStatus,
      // `confirmed_for`가 빠져 있었다. 호출 쪽이 전개 연산자로 넣어 초과 속성 검사를
      // 비껴가는 바람에 타입 검사가 통과했고, 값은 실행 시점에만 서버까지 갔다.
      // 키를 잘못 적거나 `extra`를 구조 분해로 고치면 조용히 사라지는 자리였다.
      extra?: {
        meeting_place?: string;
        proposed_at?: string;
        confirmed_for?: string;
        cancel_reason?: string;
      },
    ): Promise<boolean> => {
      if (!token) return false;
      try {
        const updated = await patchStaffVisit(token, id, { status, ...extra });
        const next = toStaffRequest(updated);
        setState((s) => ({
          ...s,
          requests: s.requests.map((r) => (r.id === id ? next : r)),
          error: null,
        }));
        return true;
      } catch (err) {
        setState((s) => ({
          ...s,
          error: err instanceof ApiError ? err.message : "지금은 처리하지 못했어요.",
        }));
        return false;
      }
    },
    [token],
  );

  return { ...state, reload: load, act };
}
