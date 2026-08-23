// 서버가 준 할 일 목록을 화면 타입으로 옮긴다 (§4.1).
//
// 계약(`IntakeTask`)과 화면 타입(`Task`)을 따로 두는 이유는 §4.1의 결정 때문이다.
// **제도 원본과 사용자별 판정을 한 구조에 담지 않는다.** 계약은 서버가 정하고, 화면
// 타입은 인덱스 탭이 필요로 하는 모양이다. 둘을 하나로 합치면 계약이 바뀔 때마다
// 화면이 흔들린다.
import type { IntakeCardOption, IntakeTask } from "@/shared/types";

import type { DeskGuide, RouteContact, Task } from "./task";

/** 값이 있을 때만 요소가 생긴다. 자리를 먼저 잡아두면 대부분의 카드에 빈 공간이 생긴다. */
function deskOf(option: IntakeCardOption): DeskGuide | undefined {
  if (!option.desk_place || !option.desk_say) return undefined;
  return { place: option.desk_place, say: option.desk_say };
}

function contactOf(option: IntakeCardOption): RouteContact | undefined {
  if (!option.contact_org || !option.contact_phone) return undefined;
  return {
    org: option.contact_org,
    phone: option.contact_phone,
    dial: option.contact_phone.replace(/[^0-9]/g, ""),
    hours: option.contact_hours || undefined,
  };
}

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
    // 창구 안내가 있으면 where는 그쪽이 대신한다. 같은 말을 두 번 내지 않는다.
    const where = deskOf(o) ? "" : o.where;
    return [where ? `${head}${where}` : "", o.next_step].filter(Boolean);
  });
}

/**
 * 준비물 이름을 창구에서 쓰는 말로 바꾼다.
 *
 * **지식 베이스는 법령·고시의 문구를 그대로 담고 있어 같은 것을 여러 이름으로 부른다.**
 * 실제로 "신분 확인 서류"와 "신분증"이 함께 들어 있다. 사용자는 이것을 챙겨서
 * 창구에 가야 하는데, 설명하는 말투("~을 확인할 수 있는 서류")로는 무엇을 들고
 * 가야 하는지 알 수 없고 창구에서 그 이름으로 말할 수도 없다.
 *
 * **지식 베이스 쪽은 근거 문구를 그대로 둔다.** 바꾸는 것은 화면에 나가는 이름뿐이다.
 */
const DOC_NAMES: Record<string, string> = {
  "신분 확인 서류": "신분증",
  "출소 사실을 확인할 수 있는 서류": "출소확인서",
  "수용증명서 또는 신분 확인 서류(있는 대로)": "수용증명서 또는 신분증 (있는 대로)",
};

/** 신청 경로 여럿의 준비물을 합친다. 같은 서류가 겹치면 한 번만 낸다. */
function mergedDocs(task: IntakeTask): string[] {
  const seen = new Set<string>();
  const add = (d: string) => seen.add(DOC_NAMES[d] ?? d);
  for (const d of task.card.docs) add(d);
  for (const o of task.card.options) {
    for (const d of o.docs) add(d);
  }
  return [...seen];
}

export function toTask(item: IntakeTask): Task {
  // 창구 안내와 연락처는 첫 경로 것을 쓴다. 여럿일 때는 각 경로의 안내가 info 줄에 들어간다.
  const first = item.card.options[0];

  // **확인 날짜를 안내 목록에 넣지 않는다.** 넣으면 ✓가 붙어 할 일처럼 읽힌다.
  const info = [item.card.summary_easy, ...optionLines(item)];

  return {
    id: item.route_id,
    title: item.route_label,
    tabLabel: item.tab_label,
    // 어디서 하는 일인지만 낸다. 소요 시간은 검증된 값이 아니라 화면에 내지 않는다.
    meta: item.section_label,
    must: item.blocks_others,
    info: info.filter(Boolean),
    verifiedNote: item.card.verified_note || undefined,
    // 서버가 판정한다. 화면이 지원 항목 표를 들고 있으면 배정 규칙이 두 군데가 된다.
    visitLabel: item.can_request_visit ? item.route_label : undefined,
    docs: mergedDocs(item),
    desk: first ? deskOf(first) : undefined,
    contact: first ? contactOf(first) : undefined,
  };
}

export function toTasks(items: readonly IntakeTask[]): Task[] {
  return items.map(toTask);
}
