// 담당자에게 함께 보낼 진단 답변 (§7.4-1 · §7.6).
//
// **목적은 담당자 편의가 아니다.** 인터뷰가 밝힌 실질 장벽은 "창구에서 신분이 드러나는
// 순간"이었고, 미리 보내면 **그 말을 입으로 하지 않아도 된다.** §7.6이 이 기능 전체의
// 목적으로 적어둔 "창구 노출 부담을 서비스가 흡수한다"가 그것이다.
//
// **답변은 저장해 두었다가 꺼내는 것이 아니라 보내는 순간의 것을 싣는다.** 서버는
// 진단 답변을 상시 보관하지 않는다 — 보관하면 "오늘 밤 잘 곳이 없다 · 통장이 압류됐다 ·
// 정신과 상담이 필요하다"가 한 줄에 모이고, 그것은 출소 사실보다 구체적인 취약성
// 목록이 된다(§9.1). 방문 요청에만 붙어 있다가 함께 파기된다(§9.5).
//
// **동의는 보낼 때마다 받는다.** 가입 시점에는 사용자가 자기가 무엇을 답할지 모르므로
// 그때 받는 동의는 무엇에 동의하는지 모르는 상태다.
import { INTAKE_QUESTIONS } from "@/features/intake/domain/questions";
import {
  answerLabel,
  visibleQuestions,
  type IntakeAnswers,
} from "@/features/intake/domain/questionTypes";
import { SECTIONS, type SectionId } from "@/features/intake/domain/sections";

/** 담당자에게 가는 답 한 줄. **id가 아니라 사람이 읽는 문장으로 보낸다.** */
export type SharedAnswer = {
  /** 어느 지원 항목의 문항인지. 서버가 이 값으로 정렬한다. */
  route_id: string;
  section: string;
  question: string;
  answer: string;
};

/**
 * 지원 항목을 처리하는 기관 갈래.
 *
 * **어느 분야를 기본으로 켤지 정하는 데 쓴다.** 주민센터에 가는 사람에게 공단 것까지
 * 보낼 이유가 없다. 서버가 갈래 코드를 내려보내기 시작하면 이 표는 지운다 —
 * 그때까지 화면이 판단할 근거가 필요해 둔다.
 */
const ROUTE_ORG: Record<string, string> = {
  R4: "center",
  R9: "center",
  R11: "center",
  R12: "center",
  R15: "center",
  R1: "koreha",
  R2: "koreha",
  R3: "koreha",
  R6: "koreha",
  R7: "koreha",
  R10: "bank",
  R13: "corrections",
  R8: "counsel",
  R14: "counsel",
};

/**
 * 처음에 켜둘 분야 (§7.4-1).
 *
 * **방문 목적과 같은 기관에서 처리하는 항목이 그 분야의 절반을 넘을 때만 켠다.**
 *
 * "하나라도 맞으면 켠다"로 하면 거의 다 켜진다 — 여섯 분야 중 다섯이 주민센터 항목을
 * 하나씩은 갖고 있기 때문이다. 그러면 **주민등록 재발급하러 가는 사람에게 빚과 건강까지
 * 딸려 가고**, 기본값을 좁게 잡은 뜻이 사라진다.
 *
 * 절반을 기준으로 삼는 것은 "이 분야가 주로 그 기관 일인가"를 묻는 것이다.
 * 신분·행정은 R9·R10 중 R9가 주민센터라 절반이고, 주거는 셋 중 둘이 공단이라
 * 주민센터 방문에서는 꺼진다.
 */
export function defaultSections(routeId: string): SectionId[] {
  const org = ROUTE_ORG[routeId];
  if (!org) return [];
  return SECTIONS.filter((s) => {
    const routes = s.routes.filter((r) => ROUTE_ORG[r]);
    if (routes.length === 0) return false;
    const same = routes.filter((r) => ROUTE_ORG[r] === org).length;
    return same * 2 >= routes.length;
  }).map((s) => s.id);
}

/** 답한 것이 있는 분야만. 답이 없는 분야를 켜고 끄게 하면 고를 것이 없는 칸이 생긴다. */
export function answeredSections(answers: IntakeAnswers): SectionId[] {
  return SECTIONS.filter((s) =>
    visibleQuestions(INTAKE_QUESTIONS, s.id, answers).some((q) => answers[q.id] !== undefined),
  ).map((s) => s.id);
}

/**
 * 고른 분야의 답을 문장으로 만든다.
 *
 * **화면에 보이지 않은 문항은 담기지 않는다** (§3.8). 답을 바꿔 닫힌 꼬리질문의 답은
 * 사용자가 철회한 것이므로 여기서도 빠진다.
 */
export function buildSharedAnswers(
  answers: IntakeAnswers,
  sections: readonly SectionId[],
): SharedAnswer[] {
  const rows: SharedAnswer[] = [];
  for (const section of SECTIONS) {
    if (!sections.includes(section.id)) continue;
    for (const question of visibleQuestions(INTAKE_QUESTIONS, section.id, answers)) {
      const label = answerLabel(question, answers);
      if (!label) continue;
      rows.push({
        route_id: question.routeId,
        section: section.label,
        question: question.prompt,
        answer: label,
      });
    }
  }
  return rows;
}
