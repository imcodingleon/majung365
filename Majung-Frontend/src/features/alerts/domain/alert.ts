// 알림 목록 (§7.1).
//
// **서버에 알림을 쌓지 않는다.** 이미 있는 방문 요청 데이터를 조합해서 만든다.
// 알림을 저장하면 "누가 언제 어느 기관과 연락했는가"가 한 줄씩 남고, 그것은 보관·파기
// 대상(§9.4)이 늘어나는 일이다. 근거는 `decision-log-2026-08-26.md` A-3에 있다.
//
// 이 파일은 계산만 한다. 화면도 서버 호출도 없다.
import type { VisitRequest } from "@/features/visit/domain/request";

export type AlertKind = "confirmed" | "proposed" | "cancelled" | "message";

export type Alert = {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  /** ISO 시각. 정렬과 안 읽음 판정에 쓴다. */
  at: string;
  /** 눌렀을 때 열 방문 요청. */
  visitId: string;
};

/**
 * 요청 하나에서 알림 한 줄을 만든다. 알릴 것이 없으면 `null`이다.
 *
 * **상태마다 하나씩만 만든다.** 요청 하나가 알림 둘을 내면 같은 일이 두 번 보인다.
 */
function alertFor(r: VisitRequest): Alert | null {
  const at = r.createdAt ?? "";

  // **메시지를 상태보다 먼저 본다.** 확정된 요청에 새 말이 오면 알려야 할 것은
  // 이미 본 확정 소식이 아니라 방금 온 말이다.
  if (r.unread > 0) {
    return {
      id: `${r.id}:message`,
      kind: "message",
      title: "담당자가 메시지를 보냈어요",
      body: r.unread === 1 ? "새 메시지가 있어요." : `안 읽은 메시지가 ${r.unread}개 있어요.`,
      at,
      visitId: r.id,
    };
  }

  // **확인만 한 것은 알리지 않는다.** 이 상태에서 채팅방이 열리므로 담당자가 말을
  // 걸면 위에서 알린다. 확인만 하고 아무 말이 없는 것을 알리면 열어 봐도 볼 것이 없다.

  if (r.status === "confirmed") {
    // **만날 사람과 장소가 이 알림의 전부다**(§7.1). 없으면 알릴 내용이 없다.
    if (!r.confirmation) return null;
    const { whenLabel, staffName, place, decidedAt } = r.confirmation;
    return {
      id: `${r.id}:confirmed`,
      kind: "confirmed",
      title: "방문이 확정되었어요",
      body: `${whenLabel}에 ${staffName}을 ${place}에서 만나요.`,
      // **확정을 누른 때가 이 소식이 온 때다.** 요청을 보낸 때가 아니다 — 그것을
      // 쓰면 며칠 전에 보낸 요청이 확정되어도 알림이 목록 아래에 묻힌다.
      at: decidedAt ?? at,
      visitId: r.id,
    };
  }

  if (r.status === "reschedule_proposed") {
    // 시간을 빼면 "다른 시간을 이야기했어요"만 남아 언제인지가 사라진다.
    if (!r.proposedTime) return null;
    return {
      id: `${r.id}:proposed`,
      kind: "proposed",
      title: "담당자가 다른 시간을 이야기했어요",
      body: `${r.proposedTime}은 어떠신지 물어보셨어요.`,
      at,
      visitId: r.id,
    };
  }

  if (r.status === "cancelled") {
    return {
      id: `${r.id}:cancelled`,
      kind: "cancelled",
      title: "방문이 취소되었어요",
      // 이유는 담당자가 쓴 말을 그대로 낸다. 없으면 빈 줄로 둔다.
      body: r.cancelReason ?? "",
      at,
      visitId: r.id,
    };
  }

  return null;
}

/**
 * 방문이 끝난 확정 소식인가.
 *
 * **약속한 날까지는 남긴다** (2026-08-26 결정 G-5). "약속 시간이 언제였지?" 할 때
 * 알림을 눌러 바로 확인하는 것이 이 목록의 쓸모다. 확인하자마자 사라지면 그 쓸모가
 * 없어진다.
 *
 * 그날이 지나면 내린다 — 지난 약속이 계속 위에 남아 있으면 다음 소식이 묻힌다.
 * 날짜 단위로 본다: 오후 2시 약속이 오후 3시에 사라지면 그날 안에 다시 볼 수 없다.
 */
function isPastVisit(r: VisitRequest, now: Date): boolean {
  const when = r.confirmation?.whenIso;
  if (!when) return false;
  const at = new Date(when);
  if (Number.isNaN(at.getTime())) return false;
  const endOfVisitDay = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1);
  return now.getTime() >= endOfVisitDay.getTime();
}

/**
 * 최근 것이 위로 온다.
 *
 * **지난 약속은 내린다.** 그 밖의 소식은 그대로 쌓인다 — 취소 사유처럼 나중에 다시
 * 읽을 것이 있다.
 */
export function toAlerts(requests: readonly VisitRequest[], now: Date = new Date()): Alert[] {
  return requests
    .filter((r) => !(r.status === "confirmed" && r.unread === 0 && isPastVisit(r, now)))
    .map(alertFor)
    .filter((a): a is Alert => a !== null)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * 같은 날 온 소식을 묶는 이름. 메신저에서 날짜 줄이 하는 일과 같다.
 *
 * **오늘·어제는 날짜로 적지 않는다.** "8월 26일"보다 "오늘"이 먼저 읽히고, 방금 온
 * 소식인지 아닌지가 그 한 단어로 갈린다.
 */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (!iso || Number.isNaN(at.getTime())) return "";

  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(at)) / 86_400_000);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"] as const;
  return `${at.getMonth() + 1}월 ${at.getDate()}일 ${WEEKDAY[at.getDay()]}요일`;
}

/** 소식이 온 시각. 예: "오후 2시 30분". 목록 오른쪽에 작게 붙는다. */
export function timeLabel(iso: string): string {
  const at = new Date(iso);
  if (!iso || Number.isNaN(at.getTime())) return "";
  const half = at.getHours() < 12 ? "오전" : "오후";
  const hour = at.getHours() % 12 === 0 ? 12 : at.getHours() % 12;
  return `${half} ${hour}시 ${String(at.getMinutes()).padStart(2, "0")}분`;
}

export type AlertDay = {
  label: string;
  items: readonly Alert[];
};

/**
 * 날짜별로 묶는다. **순서는 건드리지 않는다** — 이미 최근 것이 위에 있다.
 *
 * 시각을 모르는 소식은 맨 아래에 "언제인지 모름"으로 모은다. 날짜를 지어내면 그것이
 * 곧 틀린 정보가 된다.
 */
export function groupByDay(alerts: readonly Alert[], now: Date = new Date()): AlertDay[] {
  const days: AlertDay[] = [];
  for (const alert of alerts) {
    const label = dayLabel(alert.at, now) || "언제인지 모름";
    const last = days[days.length - 1];
    if (last && last.label === label) (last.items as Alert[]).push(alert);
    else days.push({ label, items: [alert] });
  }
  return days;
}

/**
 * 안 읽은 건수.
 *
 * **"안 읽음"이 두 종류다.**
 *
 * 메시지는 **서버가 센다** — 대화를 열어 읽음 표시를 보내야 0이 된다. 그 값 자체가
 * 안 읽음의 정의이므로 기기의 시각으로 다시 거르지 않는다. 거르면 알림 화면을 한 번
 * 지나친 뒤에 온 메시지가 배지에서 사라진다.
 *
 * 나머지 소식(확정·시간 제안·취소)은 **기기가 마지막으로 본 시각**으로 센다. 서버에
 * 알림을 쌓지 않기로 했으므로(§9.4) 읽었는지를 아는 곳이 기기뿐이다.
 *
 * **본 시각과 같은 것은 읽은 것으로 센다.** 같은 순간에 온 것을 안 읽은 것으로 세면
 * 배지가 영영 사라지지 않는다.
 */
export function countUnseen(alerts: readonly Alert[], lastSeen: string | null): number {
  return alerts.filter((a) => isUnseen(a, lastSeen)).length;
}

/**
 * 이 소식을 아직 안 봤는가. **하단 바의 숫자와 목록의 점이 같은 판정을 쓴다.**
 *
 * 나누어 두면 배지는 떴는데 점은 없는 일이 생긴다 — 실제로 그렇게 어긋나 있었다.
 */
export function isUnseen(alert: Alert, lastSeen: string | null): boolean {
  if (alert.kind === "message") return true;
  return lastSeen === null || alert.at > lastSeen;
}
