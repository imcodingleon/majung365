// 초기 진단 문항의 모형 (intake-questions.md).
//
// 문항 값(문구·optionId)은 questions.ts 한 곳에만 둔다. 화면 코드는 이 타입만 보고 그리므로
// 기획이 문구나 optionId를 확정하면 그 파일의 값만 바꾸면 된다.
import type { RouteId } from "@/shared/types/route";

import type { SectionId } from "./sections";

export type QuestionKind = "single" | "multi" | "date";

/** 어떤 문항의 어떤 답을 골랐을 때를 가리키는 조건. */
export type AnswerCondition = {
  questionId: string;
  optionIds: readonly string[];
};

export type IntakeOption = {
  id: string;
  label: string;
  /**
   * 고르면 다른 선택을 모두 거둔다. 복수선택의 "잘 모르겠어요"가 이것이다.
   * 모르겠다고 하면서 다른 것을 함께 고른 상태는 뜻이 통하지 않는다.
   */
  exclusive?: boolean;
  /**
   * 접혀 있다가 펼쳐야 보이는 선택지. 해당하는 사람에게만 필요한 답을
   * 모두에게 보이지 않게 한다 (Q2-1의 뒤 세 개).
   */
  collapsed?: boolean;
  /**
   * 목록 맨 위에 두고 구분선으로 떼어 놓는다. 이 답 하나만 처리가 다르다
   * (Q5-1의 "지금 바로 치료받아야 해요"는 119·응급실 안내로 간다).
   */
  standout?: boolean;
  /** 이 조건이 맞으면 선택지를 감춘다. 같은 것을 두 번 묻지 않기 위해서다 (규칙 ⑪). */
  hideWhen?: AnswerCondition;
};

export type IntakeQuestion = {
  id: string;
  sectionId: SectionId;
  /** 이 문항이 판정하는 지원 항목. 꼬리질문은 부모와 같다. */
  routeId: RouteId;
  /** 화면에 나가는 질문. */
  prompt: string;
  /** 도움말. 공식 제도명은 여기서 한 번만 알려준다 (규칙 ①·②). */
  help?: string;
  kind: QuestionKind;
  /** 서버로 보낼 때 쓰는 키. */
  dataKey: string;
  options?: readonly IntakeOption[];
  /** 꼬리질문의 노출 조건. 없으면 필수 문항이라 늘 보인다. */
  showWhen?: AnswerCondition;
  /** 접힌 선택지를 펼치는 버튼 문구. */
  expandLabel?: string;
  /** 날짜 문항에서 "잘 모르겠어요"를 함께 둘지. */
  allowUnknown?: boolean;
  /** 조건이 맞을 때 선택지 대신 내보내는 확인 문구 (규칙 ⑪). */
  noteWhen?: { when: AnswerCondition; text: string };
};

/** 한 문항의 답. 단일선택은 문자열, 복수선택은 배열, 날짜는 YYYY-MM-DD 또는 UNKNOWN이다. */
export type IntakeAnswer = string | readonly string[];

export type IntakeAnswers = Record<string, IntakeAnswer>;

/** 날짜 문항에서 "잘 모르겠어요"를 고른 상태. */
export const DATE_UNKNOWN = "UNKNOWN";

function conditionMet(condition: AnswerCondition, answers: IntakeAnswers): boolean {
  const answer = answers[condition.questionId];
  if (answer === undefined) return false;
  if (Array.isArray(answer)) return answer.some((a) => condition.optionIds.includes(a));
  return condition.optionIds.includes(answer as string);
}

/** 지금 이 문항을 화면에 내야 하는지. 꼬리질문은 조건이 맞을 때만 나온다. */
export function isVisible(question: IntakeQuestion, answers: IntakeAnswers): boolean {
  return !question.showWhen || conditionMet(question.showWhen, answers);
}

/** 지금 이 문항에서 고를 수 있는 선택지. 이미 답한 것과 겹치는 선택지는 빠진다. */
export function visibleOptions(
  question: IntakeQuestion,
  answers: IntakeAnswers,
): readonly IntakeOption[] {
  if (!question.options) return [];
  return question.options.filter((o) => !o.hideWhen || !conditionMet(o.hideWhen, answers));
}

/** 선택지 대신 낼 확인 문구가 있으면 그것을 돌려준다. */
export function noteFor(question: IntakeQuestion, answers: IntakeAnswers): string | null {
  if (!question.noteWhen) return null;
  return conditionMet(question.noteWhen.when, answers) ? question.noteWhen.text : null;
}

/**
 * 한 분야에서 지금 화면에 노출된 문항들.
 * 분야 완료 판정이 "노출된 문항을 모두 답했는가"이므로 이 목록이 그 기준이 된다 (§3.8-②).
 */
export function visibleQuestions(
  questions: readonly IntakeQuestion[],
  sectionId: SectionId,
  answers: IntakeAnswers,
): readonly IntakeQuestion[] {
  return questions.filter((q) => q.sectionId === sectionId && isVisible(q, answers));
}

export function isAnswered(question: IntakeQuestion, answers: IntakeAnswers): boolean {
  const answer = answers[question.id];
  if (answer === undefined) return false;
  if (Array.isArray(answer)) return answer.length > 0;
  return String(answer).length > 0;
}

/**
 * 서버로 보낼 답만 추린다 (§3.8 · §12-20).
 *
 * **보이지 않는 답은 보내지 않는다.** 답을 바꿔 꼬리질문이 닫히면 앞서 적은 답은 화면에서
 * 사라지지만 상태에는 남아 있다. 그것을 그대로 보내면 **사용자가 스스로 철회한 정보를
 * 수집하는 셈**이 된다. 통장 정지 사유처럼 사정을 적었다가 물린 답이 특히 그렇다.
 *
 * `dataKey`를 공유하는 문항(Q3-2-1·Q3-2-2)에서는 이 규칙이 없으면 어느 문항의 답인지도
 * 구분되지 않는다. 다만 규칙 자체는 공유하지 않는 문항에도 그대로 적용된다.
 */
export function answersToSend(
  questions: readonly IntakeQuestion[],
  answers: IntakeAnswers,
): Record<string, IntakeAnswer> {
  const payload: Record<string, IntakeAnswer> = {};
  for (const question of questions) {
    if (!isVisible(question, answers)) continue;
    const answer = answers[question.id];
    if (answer === undefined) continue;
    if (Array.isArray(answer) && answer.length === 0) continue;
    payload[question.dataKey] = answer;
  }
  return payload;
}
