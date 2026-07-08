// 로드맵 표시형 체크리스트 항목 (CAP-4). 완료 체크 상호작용은 본선 — 예선은 표시만.

export type Urgency = "high" | "normal";

export interface RoadmapTask {
  id: string;
  title: string;
  description: string;
  urgency: Urgency;
  /** 기한 경고 문구 (없으면 null) */
  deadline?: string | null;
  /** 바로가기 URL (없으면 null) */
  linkUrl?: string | null;
  /** 카드 아이콘(이모지). 없으면 기본값. */
  icon?: string;
}
