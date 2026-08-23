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
