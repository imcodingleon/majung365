// 아코디언 열림 규칙 (§5.2).
// 가입 직후 첫 진입에 1번 탭이 열려 있어야 하고, 완료할 때마다 다음 미완료 탭이 자동으로 열린다.
// 무엇부터 눌러야 하는지를 사용자가 판단하게 두지 않는 것이 이 규칙의 목적이다.
import { useCallback, useState } from "react";

import { firstUndoneId, type RouteId, type Task, type TaskProgress } from "../domain/task";

type Params = {
  tasks: readonly Task[];
  progress: Readonly<Record<string, TaskProgress>>;
  onComplete: (id: RouteId) => void;
};

type Result = {
  /** 지금 열려 있는 탭. 모두 닫혔으면 null. */
  openId: RouteId | null;
  /** 자동으로 열린 탭. 화면 밖이면 그 위치로 스크롤해야 한다 (§5.2). */
  autoOpenedId: RouteId | null;
  toggle: (id: RouteId) => void;
  complete: (id: RouteId) => void;
  clearAutoOpened: () => void;
};

export function useTaskAccordion({ tasks, progress, onComplete }: Params): Result {
  // 첫 진입은 1번 탭이 열린 상태로 시작한다. 전부 닫아 두면 사용자가 판단해야 한다.
  const [openId, setOpenId] = useState<RouteId | null>(() => firstUndoneId(tasks, progress));
  const [autoOpenedId, setAutoOpenedId] = useState<RouteId | null>(null);

  // 한 번에 하나만 열린다. 사용자가 다른 탭을 직접 여는 것은 막지 않는다.
  const toggle = useCallback((id: RouteId) => {
    setAutoOpenedId(null);
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  const complete = useCallback(
    (id: RouteId) => {
      onComplete(id);
      // 방금 완료한 것을 뺀 나머지에서 다음 미완료를 찾는다.
      const nextProgress = { ...progress, [id]: { done: true } };
      const next = firstUndoneId(tasks, nextProgress);
      setOpenId(next);
      setAutoOpenedId(next);
    },
    [onComplete, progress, tasks],
  );

  const clearAutoOpened = useCallback(() => setAutoOpenedId(null), []);

  return { openId, autoOpenedId, toggle, complete, clearAutoOpened };
}
