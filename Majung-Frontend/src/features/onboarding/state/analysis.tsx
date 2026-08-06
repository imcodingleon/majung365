// 온보딩 분석 결과 공유 상태 — 질문 화면(제출) → 로딩 화면(대기) → 오늘의 과제 화면(표시)
// 3개 화면이 함께 쓰므로 온보딩 스택 레이아웃에서만 감싼다(feature-local, shared 승격 아님).
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

import type { NodeAnswerInput, TaskCard } from "@/shared/types";
import { ApiError, postAnalyze } from "@/shared/utils/api";

const GENERIC_ERROR = "지금 잠시 연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.";

export type AnalysisStatus = "idle" | "loading" | "done" | "error";

interface AnalysisContextValue {
  status: AnalysisStatus;
  task: TaskCard | null;
  error: string | null;
  /** 마지막 질문 완료 시 호출 — 분석을 시작한다(비동기, 결과는 status/task로 반영). */
  start: (answers: NodeAnswerInput[], narrative?: string) => void;
  /** 실패 후 같은 답변으로 재시도할 때 쓰려면 answers를 보관해 뒀다가 다시 start() 호출 */
  reset: () => void;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

export function OnboardingAnalysisProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [task, setTask] = useState<TaskCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback((answers: NodeAnswerInput[], narrative?: string) => {
    setStatus("loading");
    setError(null);
    postAnalyze({ answers, narrative })
      .then((result) => {
        setTask(result);
        setStatus("done");
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : GENERIC_ERROR);
        setStatus("error");
      });
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setTask(null);
    setError(null);
  }, []);

  const value = useMemo(
    () => ({ status, task, error, start, reset }),
    [status, task, error, start, reset],
  );
  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useOnboardingAnalysis(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error("useOnboardingAnalysis must be used within OnboardingAnalysisProvider");
  return ctx;
}
