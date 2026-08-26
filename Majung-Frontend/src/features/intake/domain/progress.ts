// 초기 진단의 진행 상태 (§3.7·§3.8-②).
//
// 분야 완료 판정은 "화면에 실제로 노출된 문항을 모두 답했는가"다. 꼬리질문에 노출 조건이
// 있으므로 필요한 문항 수는 사람마다 자동으로 달라진다. 고정된 개수로 세지 않는다.
import type { SectionId } from "./sections";

export type SectionProgress = {
  /** 지금 이 분야에서 화면에 노출된 문항 수. */
  visible: number;
  /** 그중 답한 문항 수. */
  answered: number;
};

export type IntakeProgress = Partial<Record<SectionId, SectionProgress>>;

export function isSectionDone(p: SectionProgress | undefined): boolean {
  // 노출된 문항이 하나도 없으면 아직 열어보지 않은 것이다. 완료가 아니다.
  return Boolean(p && p.visible > 0 && p.answered >= p.visible);
}

export function doneSectionCount(
  sections: readonly { id: SectionId }[],
  progress: IntakeProgress,
): number {
  return sections.filter((s) => isSectionDone(progress[s.id])).length;
}

/** 6개 분야를 모두 마쳐야 가입이 완료된다 (§3.7). */
export function allSectionsDone(
  sections: readonly { id: SectionId }[],
  progress: IntakeProgress,
): boolean {
  return sections.every((s) => isSectionDone(progress[s.id]));
}

/**
 * 진행 막대에 적을 총 개수 (2026-08-26 결정 H-4).
 *
 * **답을 고르는 순간이 아니라 다음을 눌렀을 때 따라간다.** 꼬리질문이 열리면 실제
 * 문항 수가 그 자리에서 늘어나는데, 그대로 그리면 "5개 중 3번째"가 답 하나 골랐다고
 * "8개 중 3번째"로 바뀐다. **막대가 뒤로 밀리는 것처럼 보여** 진행하다 말았다는
 * 인상을 준다.
 *
 * @param shown  지금 화면에 적혀 있는 총 개수
 * @param live   실제 문항 수. 답에 따라 그때그때 달라진다
 * @param step   지금 몇 번째를 보고 있는가 (0부터)
 * @param moved  방금 앞뒤로 이동했는가
 */
export function totalToShow(shown: number, live: number, step: number, moved: boolean): number {
  // 이동할 때 실제 수로 맞춘다. 새 문항을 만나는 순간이라 숫자가 바뀌어도 납득된다.
  if (moved) return live;
  // **지금 보는 자리보다 작게 적지 않는다.** 답을 바꿔 꼬리질문이 닫히면 실제 수가
  // 줄어드는데, 그때 "3개 중 5번째"가 되면 무슨 말인지 알 수 없다.
  return Math.max(Math.min(shown, Math.max(live, step + 1)), step + 1);
}
