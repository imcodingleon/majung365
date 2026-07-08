// 로드맵 공유 상태 — 챗봇(오늘의 할일에 추가)과 로드맵 화면이 함께 쓰므로 shared에 둔다.
// 예선은 무DB·표시형: 앱 메모리 Context로 충분(YAGNI, Jotai 미도입).
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

import type { CardData } from "../types";
import type { RoadmapTask } from "../types/roadmap";

let seq = 0;
const nid = (): string => `t${(seq += 1)}`;

// 데모 시드 (김판수 시나리오 · Figma 2:1614). 7/8 인터뷰 후 실데이터로 교체.
const SEED: RoadmapTask[] = [
  {
    id: nid(),
    title: "임시 숙소 신청하기",
    description: "안정적인 주거 공간 확보를 위해 시에서 운영하는 긴급 지원 주택을 신청하세요.",
    urgency: "high",
    deadline: "오늘 오후 6시",
    linkUrl: null,
    icon: "🏠",
  },
  {
    id: nid(),
    title: "긴급 생계비 지원 확인",
    description: "당장의 생활 안정을 위한 정부 지원금 대상 여부를 확인하고 서류를 준비하세요.",
    urgency: "normal",
    deadline: null,
    linkUrl: null,
    icon: "💰",
  },
];

interface RoadmapContextValue {
  tasks: RoadmapTask[];
  /** 챗봇 제도 카드를 로드맵 할일로 추가 (CAP-3 → CAP-4 seam). 제목 중복은 무시. */
  addFromCard: (card: CardData) => void;
}

const RoadmapContext = createContext<RoadmapContextValue | null>(null);

export function RoadmapProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<RoadmapTask[]>(SEED);

  const addFromCard = useCallback((card: CardData) => {
    setTasks((prev) =>
      prev.some((t) => t.title === card.name)
        ? prev
        : [
            ...prev,
            {
              id: nid(),
              title: card.name,
              description: card.summary_easy,
              urgency: card.deadline ? "high" : "normal",
              deadline: card.deadline,
              linkUrl: card.source_url || null,
              icon: "📋",
            },
          ],
    );
  }, []);

  const value = useMemo(() => ({ tasks, addFromCard }), [tasks, addFromCard]);
  return <RoadmapContext.Provider value={value}>{children}</RoadmapContext.Provider>;
}

export function useRoadmap(): RoadmapContextValue {
  const ctx = useContext(RoadmapContext);
  if (!ctx) throw new Error("useRoadmap must be used within RoadmapProvider");
  return ctx;
}
