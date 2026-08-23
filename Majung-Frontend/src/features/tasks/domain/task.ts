// 오늘의 할 일 도메인 — 기획서 §4·§5.
// 할 일 하나는 지원 항목(R번호) 하나에 대응하며, 지원 항목 이름이 곧 인덱스 탭 제목이 된다.
import type { RouteId } from "@/shared/types/route";

export type { RouteId };

/** 담당 기관 연락처. 정본은 route-contacts.md이며 서버가 응답에 실어 보낸다(§6.4 ③단계). */
export type RouteContact = {
  /** 기관명. 번호만 있으면 어디에 거는지 알 수 없으므로 항상 함께 낸다. */
  org: string;
  /** 표시용 번호. "국번없이 110"처럼 안내 문구가 붙은 형태 그대로 쓴다. */
  phone: string;
  /** 실제 발신에 쓸 숫자만 남긴 번호. */
  dial: string;
  /** 상담 가능 시간이 확인된 곳만 채운다. */
  hours?: string;
};

/** 갈 곳이 하나로 정해지는 항목은 전화번호보다 창구 안내가 먼저 온다 (§6.4). */
export type DeskGuide = {
  /** 갈 곳. 예: "주민센터" */
  place: string;
  /** 창구에서 말할 한 문장. 예: "주민등록증 재발급하러 왔어요" */
  say: string;
};

export type Task = {
  id: RouteId;
  /**
   * 이 일을 마쳤는지. **서버가 아니라 기기가 판정한다.**
   *
   * 서버 응답은 마친 항목을 뺀 목록이라 이 값이 없다. 훅이 완료 집합을 보고 채운다.
   */
  done?: boolean;
  /** 인덱스 탭 제목이자 할 일 이름. */
  title: string;
  /** 색깔 탭 안에 들어가는 짧은 말. 폭이 좁아 3~4자를 넘기지 않는다. */
  tabLabel: string;
  /**
   * 어디서 하는 일인지. 예: "주민센터에서 해요"
   *
   * **소요 시간을 넣지 않는다.** 그래프의 duration_days가 검증되지 않은 추정치라
   * "약 30분"이라고 적었는데 두 시간 걸리면 그것 때문에 그날 다른 일정을 잡는다.
   * 확인된 값이 생기면 그때 붙인다.
   */
  meta: string;
  /** 다른 할 일의 선행조건이라 먼저 마쳐야 하는 항목. */
  must: boolean;
  /** 카드에 펼쳐 보여줄 안내. 한 줄에 한 가지만 담는다 (§3.9-⑦). */
  info: string[];
  /**
   * 챙겨 가야 할 것 (§4.1의 KB `docs`). 안내 문장과 성격이 다르다.
   * 방문 알림의 준비물 체크가 이 목록을 쓴다 (§7.2). 없는 항목도 있다.
   */
  docs?: readonly string[];
  contact?: RouteContact;
  desk?: DeskGuide;
  /** 담당자에게 방문을 미리 알릴 수 있는 항목이면 그 방문 이름. */
  visitLabel?: string;
  /**
   * 이 안내를 언제 확인했는지. 서버가 완성된 문장으로 준다 (§6.4).
   *
   * **안내 목록에 섞지 않는다.** 목록에 넣으면 ✓가 붙어 할 일처럼 읽힌다 —
   * "주민센터에 가세요"와 "8월 20일에 확인했어요"가 같은 무게로 나란히 서면,
   * 사용자는 뒤의 것도 해야 할 일로 읽는다. 카드 맨 아래에 따로 둔다.
   */
  verifiedNote?: string;
};

export type TaskProgress = {
  done: boolean;
};

/** 아직 마치지 않은 첫 할 일. 강조 배지와 자동 열림의 기준이 된다 (§5.1·§5.2). */
export function firstUndoneId(
  tasks: readonly Task[],
  progress: Readonly<Record<string, TaskProgress>>,
): RouteId | null {
  const found = tasks.find((t) => !progress[t.id]?.done);
  return found ? found.id : null;
}

/** 아직 마치지 않은 선행 필수 항목들. 뒤 순서를 먼저 열었을 때 유도 문구에 쓴다 (§5.2). */
export function pendingMustTitles(
  tasks: readonly Task[],
  progress: Readonly<Record<string, TaskProgress>>,
): string[] {
  return tasks.filter((t) => t.must && !progress[t.id]?.done).map((t) => t.title);
}

export function doneCount(
  tasks: readonly Task[],
  progress: Readonly<Record<string, TaskProgress>>,
): number {
  return tasks.filter((t) => progress[t.id]?.done).length;
}
