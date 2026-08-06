// 온보딩 진행 UseCase — 단계·선택 상태 관리(순수 UI 상태). 백엔드 제출은 features/onboarding/state/analysis.
// 9문항(O/X/△ 버튼) 다음에 자유서술 단계 1개가 더 있다(총 10단계) — 버튼으로 담기 어려운
// 사정을 마지막에 한 번에 받아 종합 판정한다(narrative, 선택 사항).
import { useCallback, useState } from "react";

import type { NodeAnswerInput } from "@/shared/types";

import { type OnboardingQuestion, QUESTIONS } from "../domain/questions";

const TOTAL_STEPS = QUESTIONS.length + 1;
const NARRATIVE_STEP = QUESTIONS.length;

export interface UseOnboarding {
  step: number;
  total: number;
  /** 자유서술 단계에서는 undefined. */
  question: OnboardingQuestion | undefined;
  isNarrativeStep: boolean;
  selectedOptionId: string | undefined;
  narrative: string;
  setNarrative: (text: string) => void;
  canProceed: boolean;
  isLast: boolean;
  select: (optionId: string) => void;
  /** 다음 단계로. 자유서술 단계에서 누르면 false 반환(화면이 제출 처리). */
  goNext: () => boolean;
  /** 이전 단계로. 첫 단계면 false 반환(화면이 이탈 처리). */
  goPrev: () => boolean;
  /** 9문항 답변을 백엔드 계약(NodeAnswerInput[])으로 변환한다. */
  toAnswers: () => NodeAnswerInput[];
  /** 자유서술을 백엔드로 보낼 형태로. 비어 있으면 undefined. */
  toNarrative: () => string | undefined;
}

export function useOnboarding(): UseOnboarding {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [narrative, setNarrative] = useState("");

  const isNarrativeStep = step === NARRATIVE_STEP;
  const question = isNarrativeStep ? undefined : QUESTIONS[step];
  const selectedOptionId = question ? answers[question.nodeId] : undefined;
  const isLast = isNarrativeStep;

  const select = useCallback(
    (optionId: string) => {
      if (!question) return;
      setAnswers((a) => ({ ...a, [question.nodeId]: optionId }));
    },
    [question],
  );

  const goNext = useCallback(() => {
    if (isNarrativeStep) return false;
    setStep((s) => s + 1);
    return true;
  }, [isNarrativeStep]);

  const goPrev = useCallback(() => {
    if (step === 0) return false;
    setStep((s) => s - 1);
    return true;
  }, [step]);

  // 자유서술은 선택 사항이라 항상 진행 가능. 질문 단계는 버튼을 골라야 진행 가능.
  const canProceed = isNarrativeStep ? true : Boolean(selectedOptionId);

  const toAnswers = useCallback((): NodeAnswerInput[] => {
    return QUESTIONS.map((q) => {
      const optionId = answers[q.nodeId];
      const opt = q.options.find((o) => o.id === optionId);
      return { node_id: q.nodeId, state: opt?.state ?? "UNKNOWN" };
    });
  }, [answers]);

  const toNarrative = useCallback((): string | undefined => {
    const trimmed = narrative.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, [narrative]);

  return {
    step,
    total: TOTAL_STEPS,
    question,
    isNarrativeStep,
    selectedOptionId,
    narrative,
    setNarrative,
    canProceed,
    isLast,
    select,
    goNext,
    goPrev,
    toAnswers,
    toNarrative,
  };
}
