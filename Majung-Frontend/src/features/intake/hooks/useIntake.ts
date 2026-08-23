// 초기 진단 답변 상태 (§3.7·§3.8-②).
//
// 분야 완료 판정은 "화면에 실제로 노출된 문항을 모두 답했는가"다. 꼬리질문에 노출 조건이
// 있으므로 필요한 문항 수는 사람마다 자동으로 달라진다.
import { useCallback, useMemo, useState } from "react";

import type { IntakeProgress } from "../domain/progress";
import { INTAKE_QUESTIONS } from "../domain/questions";
import {
  answersToSend,
  isAnswered,
  visibleQuestions,
  type IntakeAnswers,
  type IntakeQuestion,
} from "../domain/questionTypes";
import { SECTIONS, type SectionId } from "../domain/sections";

export function useIntake() {
  const [answers, setAnswers] = useState<IntakeAnswers>({});

  /** 단일선택·날짜. 같은 답을 다시 누르면 고른 것을 물린다. */
  const setSingle = useCallback((questionId: string, optionId: string) => {
    setAnswers((prev) => {
      if (prev[questionId] === optionId) {
        const next = { ...prev };
        delete next[questionId];
        return next;
      }
      return { ...prev, [questionId]: optionId };
    });
  }, []);

  /**
   * 복수선택. `exclusive` 선택지를 고르면 나머지를 거두고, 다른 것을 고르면 그것이 빠진다.
   * 모르겠다고 하면서 다른 것을 함께 고른 상태는 뜻이 통하지 않는다.
   */
  const toggleMulti = useCallback(
    (question: IntakeQuestion, optionId: string) => {
      const exclusiveIds = (question.options ?? []).filter((o) => o.exclusive).map((o) => o.id);
      setAnswers((prev) => {
        const current = Array.isArray(prev[question.id]) ? [...(prev[question.id] as string[])] : [];
        const isExclusive = exclusiveIds.includes(optionId);

        if (current.includes(optionId)) {
          return { ...prev, [question.id]: current.filter((id) => id !== optionId) };
        }
        if (isExclusive) return { ...prev, [question.id]: [optionId] };
        return {
          ...prev,
          [question.id]: [...current.filter((id) => !exclusiveIds.includes(id)), optionId],
        };
      });
    },
    [],
  );

  const questionsFor = useCallback(
    (sectionId: SectionId) => visibleQuestions(INTAKE_QUESTIONS, sectionId, answers),
    [answers],
  );

  /**
   * 분야별 진행. 노출된 문항 수와 답한 수를 함께 센다.
   *
   * 꼬리질문이 열리면 분모가 늘어난다. 답을 바꿔 꼬리질문이 닫히면 그 답은 answers에 남지만
   * 노출 목록에서 빠지므로 완료 판정에 끼어들지 않는다.
   */
  const progress = useMemo<IntakeProgress>(() => {
    const result: IntakeProgress = {};
    for (const section of SECTIONS) {
      const visible = visibleQuestions(INTAKE_QUESTIONS, section.id, answers);
      result[section.id] = {
        visible: visible.length,
        answered: visible.filter((q) => isAnswered(q, answers)).length,
      };
    }
    return result;
  }, [answers]);

  /**
   * 서버로 보낼 답. 지금 화면에 보이는 문항의 답만 담긴다 (§3.8).
   * 답을 바꿔 닫힌 꼬리질문의 답은 사용자가 철회한 것이므로 여기서 빠진다.
   */
  const toPayload = useCallback(() => answersToSend(INTAKE_QUESTIONS, answers), [answers]);

  return { answers, setSingle, toggleMulti, questionsFor, progress, toPayload };
}
