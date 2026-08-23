// 오늘의 할 일 상태 (§5.2).
// 완료 여부와 아코디언 열림을 한자리에서 다룬다. 둘이 맞물려 있기 때문이다.
// 완료하면 그 탭이 닫히면서 다음 미완료 탭이 자동으로 열린다.
import { useCallback, useState } from "react";

import {
  doneCount,
  firstUndoneId,
  pendingMustTitles,
  type RouteId,
  type Task,
  type TaskProgress,
} from "../domain/task";
import { useTaskAccordion } from "./useTaskAccordion";

type Params = {
  tasks: readonly Task[];
};

export function useTodayTasks({ tasks }: Params) {
  const [progress, setProgress] = useState<Record<string, TaskProgress>>({});

  const markDone = useCallback((id: RouteId) => {
    setProgress((prev) => ({ ...prev, [id]: { done: true } }));
  }, []);

  const { openId, toggle, complete } = useTaskAccordion({
    tasks,
    progress,
    onComplete: markDone,
  });

  const isDone = useCallback(
    (id: RouteId) => Boolean(progress[id]?.done),
    [progress],
  );

  return {
    progress,
    openId,
    toggle,
    complete,
    isDone,
    done: doneCount(tasks, progress),
    /** 아직 마치지 않은 선행 필수 항목의 제목들. 뒤 순서를 열었을 때 유도 문구에 쓴다. */
    pendingMust: pendingMustTitles(tasks, progress),
    /** 강조 배지가 붙는 항목. 아직 마치지 않은 첫 항목 하나뿐이다. */
    headId: firstUndoneId(tasks, progress),
  };
}
