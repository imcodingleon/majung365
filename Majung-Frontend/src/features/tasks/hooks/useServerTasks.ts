// 서버에서 할 일 목록을 받아온다 (§3.8·§4.1).
//
// **서버가 진행 상태를 들고 있지 않다.** 완료한 항목을 기기가 들고 있다가 함께 보내면
// 그것을 뺀 목록이 온다.
//
// **그런데 화면에서는 마친 항목이 사라지지 않는다** (§5.2 — "1번 탭이 닫히면서 색이
// 바뀌고, 2번 탭이 자동으로 열린다"). 서버가 준 목록을 그대로 그리면 마친 항목이
// 통째로 없어져 **실수로 누른 것을 되돌릴 길이 사라진다.** 그래서 지금까지 본 항목을
// 여기서 모아 두고, 마쳤는지 여부만 따로 들고 있는다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { IntakeAnswerMap } from "@/shared/types";
import { ApiError, postIntakeAnalyze } from "@/shared/utils/api";

import { toTasks } from "../domain/fromServer";
import type { RouteId, Task } from "../domain/task";

type State = {
  /**
   * 지금까지 본 모든 할 일. **마친 것도 남는다.**
   *
   * 서버 응답은 마친 것을 뺀 목록이라 그대로 담으면 목록이 줄어든다. 처음 순서를
   * 지키면서 내용만 갱신하고, 없던 항목은 뒤에 붙인다.
   */
  all: readonly Task[];
  loading: boolean;
  /** 사용자에게 보여줄 오류 문구. 없으면 null. */
  error: string | null;
};

/**
 * 본 적 있는 목록에 새 응답을 합친다.
 *
 * **순서를 흔들지 않는다.** 서버가 마친 항목을 빼고 주기 때문에 매번 갈아끼우면
 * 사용자가 보던 자리가 위로 밀려 올라간다 — 마친 것이 사라진 것처럼 보이는 그 증상이다.
 */
function merge(seen: readonly Task[], fresh: readonly Task[]): readonly Task[] {
  const byId = new Map(fresh.map((t) => [t.id, t]));
  const kept = seen.map((t) => byId.get(t.id) ?? t);
  const known = new Set(seen.map((t) => t.id));
  return [...kept, ...fresh.filter((t) => !known.has(t.id))];
}

export function useServerTasks(answers: IntakeAnswerMap | null, initial?: readonly Task[]) {
  const [state, setState] = useState<State>({
    // 가입 응답에 할 일이 함께 왔으면 그것으로 시작한다. 화면이 비는 순간이 없어진다.
    all: initial ?? [],
    loading: false,
    error: null,
  });
  /** 마친 항목. 다음 요청에 함께 보내 서버가 목록을 다시 계산하게 한다. */
  const [completed, setCompleted] = useState<readonly RouteId[]>([]);

  const load = useCallback(
    async (done: readonly RouteId[]) => {
      if (!answers) return;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await postIntakeAnalyze({ answers, completed: done });
        const fresh = toTasks(res.tasks);
        setState((s) => ({ all: merge(s.all, fresh), loading: false, error: null }));
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : "할 일을 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요.";
        setState((s) => ({ ...s, loading: false, error: message }));
      }
    },
    [answers],
  );

  /** 가입에서 받은 목록으로 시작했으면 첫 호출을 건너뛴다. 같은 답으로 두 번 계산하지 않는다. */
  const skipFirst = useRef(Boolean(initial?.length));

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    void load(completed);
    // completed가 바뀔 때마다 다시 부른다. 선행 조건이 풀려 새 항목이 생길 수 있다.
  }, [load, completed]);

  /** 마쳤는지를 항목에 실어 화면으로 넘긴다. 화면이 완료 집합을 따로 들 필요가 없어진다. */
  const tasks = useMemo<readonly Task[]>(
    () => state.all.map((t) => ({ ...t, done: completed.includes(t.id) })),
    [state.all, completed],
  );

  const complete = useCallback((id: RouteId) => {
    setCompleted((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  /**
   * 완료를 되돌린다.
   *
   * **실수로 누르는 일이 실제로 일어난다.** 되돌릴 길이 없으면 그 항목의 안내와
   * 연락처를 다시는 볼 수 없게 되는데, 이 서비스에서 그것은 갈 곳을 잃는 것과 같다.
   */
  const uncomplete = useCallback((id: RouteId) => {
    setCompleted((prev) => prev.filter((x) => x !== id));
  }, []);

  return {
    tasks,
    total: state.all.length,
    doneCount: completed.length,
    loading: state.loading,
    error: state.error,
    completed,
    complete,
    uncomplete,
    reload: () => load(completed),
  };
}
