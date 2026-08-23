// 서버가 준 할 일 목록을 화면 타입으로 옮긴다 (§4.1).
//
// 계약(`IntakeTask`)과 화면 타입(`Task`)을 따로 두는 이유는 §4.1의 결정 때문이다.
// **제도 원본과 사용자별 판정을 한 구조에 담지 않는다.** 계약은 서버가 정하고, 화면
// 타입은 인덱스 탭이 필요로 하는 모양이다. 둘을 하나로 합치면 계약이 바뀔 때마다
// 화면이 흔들린다.
import type { IntakeTask } from "@/shared/types";

import type { RouteContact, Task } from "./task";

/**
 * 카드의 신청 경로를 화면 안내 줄로 편다.
 *
 * **경로가 여럿이면 어느 쪽 안내인지 기관명을 앞에 낸다** (§12-15의 병렬 안내).
 * 하나뿐이면 기관명이 제목과 겹치므로 붙이지 않는다.
 */
function optionLines(task: IntakeTask): string[] {
  const options = task.card.options;
  if (options.length === 0) return [];

  const many = options.length > 1;
  return options.flatMap((o) => {
    const head = many ? `${o.org} — ` : "";
    return [o.where ? `${head}${o.where}` : "", o.next_step].filter(Boolean);
  });
}

/** 신청 경로 여럿의 준비물을 합친다. 같은 서류가 겹치면 한 번만 낸다. */
function mergedDocs(task: IntakeTask): string[] {
  const seen = new Set<string>(task.card.docs);
  for (const o of task.card.options) {
    for (const d of o.docs) seen.add(d);
  }
  return [...seen];
}

export function toTask(item: IntakeTask, contact?: RouteContact): Task {
  const info = [item.card.summary_easy, ...optionLines(item)].filter(Boolean);

  return {
    id: item.route_id,
    title: item.route_label,
    tabLabel: item.tab_label,
    // 어디서 하는 일인지만 낸다. 소요 시간은 검증된 값이 아니라 화면에 내지 않는다.
    meta: item.section_label,
    must: item.blocks_others,
    info,
    docs: mergedDocs(item),
    contact,
  };
}

export function toTasks(items: readonly IntakeTask[]): Task[] {
  return items.map((item) => toTask(item));
}
