// 온보딩 진행 UseCase — 단계·선택 상태 관리(순수 UI 상태). 백엔드 호출 없음(예선).
import { useCallback, useState } from "react";

import { type OnboardingQuestion, QUESTIONS } from "../domain/questions";

export interface UseOnboarding {
  step: number;
  total: number;
  question: OnboardingQuestion;
  selectedOptionId: string | undefined;
  canProceed: boolean;
  isLast: boolean;
  select: (optionId: string) => void;
  /** 다음 단계로. 마지막이면 false 반환(화면이 완료 처리). */
  goNext: () => boolean;
  /** 이전 단계로. 첫 단계면 false 반환(화면이 이탈 처리). */
  goPrev: () => boolean;
}

export function useOnboarding(): UseOnboarding {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const question = QUESTIONS[step];
  const selectedOptionId = answers[question.id];
  const isLast = step === QUESTIONS.length - 1;

  const select = useCallback(
    (optionId: string) => setAnswers((a) => ({ ...a, [question.id]: optionId })),
    [question.id],
  );

  const goNext = useCallback(() => {
    if (isLast) return false;
    setStep((s) => s + 1);
    return true;
  }, [isLast]);

  const goPrev = useCallback(() => {
    if (step === 0) return false;
    setStep((s) => s - 1);
    return true;
  }, [step]);

  return {
    step,
    total: QUESTIONS.length,
    question,
    selectedOptionId,
    canProceed: Boolean(selectedOptionId),
    isLast,
    select,
    goNext,
    goPrev,
  };
}
