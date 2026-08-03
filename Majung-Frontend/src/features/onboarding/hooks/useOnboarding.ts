// 온보딩 진행 UseCase — 단계·선택 상태 관리(순수 UI 상태). 백엔드 제출은 features/onboarding/state/analysis.
import { useCallback, useState } from "react";

import type { NodeAnswerInput } from "@/shared/types";

import { OTHER_OPTION_ID, type OnboardingQuestion, QUESTIONS } from "../domain/questions";

interface Answer {
  optionId: string;
  /** "기타(직접입력)" 선택 시에만 쓰는 자유텍스트. */
  text: string;
}

export interface UseOnboarding {
  step: number;
  total: number;
  question: OnboardingQuestion;
  selectedOptionId: string | undefined;
  isOtherSelected: boolean;
  otherText: string;
  setOtherText: (text: string) => void;
  canProceed: boolean;
  isLast: boolean;
  select: (optionId: string) => void;
  /** 다음 단계로. 마지막이면 false 반환(화면이 제출 처리). */
  goNext: () => boolean;
  /** 이전 단계로. 첫 단계면 false 반환(화면이 이탈 처리). */
  goPrev: () => boolean;
  /** 지금까지 답변을 백엔드 계약(NodeAnswerInput[])으로 변환한다. */
  toAnswers: () => NodeAnswerInput[];
}

export function useOnboarding(): UseOnboarding {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});

  const question = QUESTIONS[step];
  const current = answers[question.nodeId];
  const selectedOptionId = current?.optionId;
  const isOtherSelected = selectedOptionId === OTHER_OPTION_ID;
  const isLast = step === QUESTIONS.length - 1;

  const select = useCallback(
    (optionId: string) =>
      setAnswers((a) => ({
        ...a,
        [question.nodeId]: { optionId, text: a[question.nodeId]?.text ?? "" },
      })),
    [question.nodeId],
  );

  const setOtherText = useCallback(
    (text: string) =>
      setAnswers((a) => ({ ...a, [question.nodeId]: { optionId: OTHER_OPTION_ID, text } })),
    [question.nodeId],
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

  const canProceed = isOtherSelected
    ? (current?.text.trim().length ?? 0) > 0
    : Boolean(selectedOptionId);

  const toAnswers = useCallback((): NodeAnswerInput[] => {
    return QUESTIONS.map((q) => {
      const a = answers[q.nodeId];
      if (!a) return { node_id: q.nodeId, state: "UNKNOWN" };
      if (a.optionId === OTHER_OPTION_ID) {
        return { node_id: q.nodeId, free_text: a.text.trim() };
      }
      const opt = q.options.find((o) => o.id === a.optionId);
      return { node_id: q.nodeId, state: opt?.state ?? "UNKNOWN" };
    });
  }, [answers]);

  return {
    step,
    total: QUESTIONS.length,
    question,
    selectedOptionId,
    isOtherSelected,
    otherText: current?.text ?? "",
    setOtherText,
    canProceed,
    isLast,
    select,
    goNext,
    goPrev,
    toAnswers,
  };
}
