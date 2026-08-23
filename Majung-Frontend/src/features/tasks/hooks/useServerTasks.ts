// 서버에서 할 일 목록을 받아온다 (§3.8·§4.1).
//
// **서버가 진행 상태를 들고 있지 않다.** 완료한 항목을 기기가 들고 있다가 함께 보내면
// 그것을 뺀 목록이 온다. 저장 없이도 완료 루프가 도는 구조다.
import { useCallback, useEffect, useRef, useState } from "react";

import type { IntakeAnswerMap } from "@/shared/types";
import { ApiError, postIntakeAnalyze } from "@/shared/utils/api";

import { toTasks } from "../domain/fromServer";
import type { RouteId, Task } from "../domain/task";

type State = {
  tasks: readonly Task[];
  /**
   * 처음 받은 할 일 개수. 진행 표시("1/5")의 분모다.
   *
   * **서버가 마친 항목을 목록에서 빼기 때문에** `tasks.length`를 분모로 쓰면
   * 하나를 끝낼 때마다 분모도 같이 줄어 진행이 영영 안 는다. 처음 값을 붙들어 둔다.
   */
  total: number;
  loading: boolean;
  /** 사용자에게 보여줄 오류 문구. 없으면 null. */
  error: string | null;
};

export function useServerTasks(answers: IntakeAnswerMap | null, initial?: readonly Task[]) {
  const [state, setState] = useState<State>({
    // 가입 응답에 할 일이 함께 왔으면 그것으로 시작한다. 화면이 비는 순간이 없어진다.
    tasks: initial ?? [],
    total: initial?.length ?? 0,
    loading: false,
    error: null,
  });
  /** 마친 항목. 다음 요청에 함께 보내 목록에서 뺀다. */
  const [completed, setCompleted] = useState<RouteId[]>([]);

  const load = useCallback(
    async (done: readonly RouteId[]) => {
      if (!answers) return;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await postIntakeAnalyze({ answers, completed: done });
        const tasks = toTasks(res.tasks);
        setState((s) => ({
          tasks,
          // 첫 응답에서만 정한다. 그 뒤로는 마친 개수만큼 목록이 줄어든다.
          total: s.total === 0 ? tasks.length + done.length : s.total,
          loading: false,
          error: null,
        }));
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
    // completed가 바뀔 때마다 다시 부른다. 완료하면 목록이 줄어든다.
  }, [load, completed]);

  const complete = useCallback((id: RouteId) => {
    setCompleted((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  return { ...state, completed, complete, reload: () => load(completed) };
}
