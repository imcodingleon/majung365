// 지금 당장 도움이 필요한 답 (§3.9-⑩).
//
// 초기 진단의 답 하나가 **다 마칠 때까지 기다리면 안 되는 것**이다.
// "지금 바로 치료받아야 해요"를 고른 사람에게 남은 문항을 마저 물은 다음 할 일 목록을
// 보여주는 것은 늦다. 고르는 순간 안내가 나가야 한다.
//
// **여기서 제도를 안내하지 않는다.** 공단 지부에 전화하라는 말은 응급인 사람에게
// 쓸모가 없다. 119와 응급실만 낸다. 이 둘은 근거 문서가 필요 없는 사실이다.
import type { IntakeAnswers, IntakeQuestion } from "./questionTypes";

export type UrgentNotice = {
  title: string;
  /** 한 줄에 한 가지. 저리터러시 사용자가 급한 상황에서 읽는 글이다. */
  lines: readonly string[];
  /** 눌러서 바로 거는 번호. */
  dial: string;
  callLabel: string;
};

/**
 * 이 답을 고르면 즉시 안내가 나가야 한다.
 *
 * 문항 데이터의 `standout`과 짝이다. `standout`은 목록에서 떼어 놓는 표시이고
 * 여기 있는 것은 그 답에 실제로 무엇을 할지다. **표시만 하고 아무것도 하지 않으면
 * 색을 바꾼 것에 그친다.**
 */
const URGENT: Record<string, UrgentNotice> = {
  // Q5-1 · R3 기초건강지원
  IMMEDIATE_TREATMENT: {
    title: "지금 바로 도움을 받으세요",
    lines: [
      "많이 아프시면 119에 전화해 주세요.",
      "구급차가 와서 병원까지 데려다줘요.",
      "가까운 병원 응급실로 바로 가셔도 돼요.",
      "돈 걱정은 나중에 해도 괜찮아요.",
    ],
    dial: "119",
    callLabel: "119에 전화하기",
  },
};

/** 지금 이 문항에서 고른 답이 급한 것이면 안내를, 아니면 null. */
export function urgentNoticeFor(
  question: IntakeQuestion,
  answers: IntakeAnswers,
): UrgentNotice | null {
  const answer = answers[question.id];
  if (answer === undefined) return null;
  const picked = Array.isArray(answer) ? answer : [answer];
  for (const id of picked) {
    const notice = URGENT[id];
    if (notice) return notice;
  }
  return null;
}
