// 담당자 방문 요청 (§7).
//
// 상태가 없으면 사용자는 보내놓고 아무것도 모르는 채 기다리게 된다. 그래서 요청이 어떤 상태를
// 거치는지, 각 상태에서 무엇이 보이는지를 도메인에 못 박는다.

import { josa } from "@/shared/utils/korean";

import type { VisitStatus } from "@/shared/types/visit";

export type { VisitStatus };

/** 확정되었을 때 알려주는 것. **만날 사람과 만날 장소가 이 기능의 핵심이다** (§7.1). */
export type VisitConfirmation = {
  /** 사람이 읽는 형태의 확정 시각. 예: "8월 25일 오후 2시" */
  whenLabel: string;
  /** 만날 담당자 이름. */
  staffName: string;
  /** 만날 장소. 예: "2층 상담실" */
  place: string;
};

export type VisitRequest = {
  id: string;
  /** 어느 할 일에 대한 방문인지. */
  taskId: string;
  status: VisitStatus;
  /** 1지망·2지망 방문 시간. 1지망이 안 될 때 조율 왕복이 한 번 줄어든다 (§7.2). */
  firstChoice: string;
  secondChoice: string;
  /** 챙겨 가기로 한 준비물. */
  readyDocs: readonly string[];
  /** 미리 말해두고 싶은 것. 쓴 경우에만 전달한다. */
  note?: string;
  confirmation?: VisitConfirmation;
  /** 담당자가 다른 시간을 제안했을 때 그 시간. */
  proposedTime?: string;
  /** 취소된 이유. 사용자에게 그대로 보여준다. */
  cancelReason?: string;
  /** 보낸 시각(ISO). 하루 상한을 미리 알려주는 데 쓴다. 서버가 주지 않으면 없다. */
  createdAt?: string | null;
};

/** 이 말로 끝나면 직함이 이미 붙은 것이다. 뒤에 "담당자"를 또 붙이지 않는다. */
const TITLE_TAIL = /(담당자|주무관|팀장|과장|계장|주임|선생님|상담사|사회복지사)$/;

/** 각 상태에서 사용자가 보는 문장 (§7.1). */
export function statusMessage(request: VisitRequest): string {
  switch (request.status) {
    case "sent":
      return "담당자에게 전달했어요. 확인하면 알려드릴게요.";
    case "acknowledged":
      return "담당자가 확인했어요.";
    case "confirmed": {
      const c = request.confirmation;
      if (!c) return "방문 시간이 정해졌어요.";
      // **만날 사람과 장소가 먼저다** (§7.1). 창구에서 신분이 드러나는 순간이 실질적
      // 장벽이고, 그 해법은 시간을 아는 것이 아니라 누구를 찾아가면 되는지 아는 것이다.
      //
      // 이름만 올 것을 전제하지 않는다. 서버가 "행정복지센터 담당자"·"박지훈 주무관"처럼
      // 직함이 섞인 값을 주기도 하고, 그때 뒤에 "담당자"를 또 붙이면
      // **"담당자 담당자를 찾으세요"**가 된다. 이름만 왔을 때만 직함을 붙인다 —
      // 한국 이름은 띄어쓰지 않으므로 공백이 있으면 이미 직함이 붙은 것으로 본다.
      // 서버가 이름을 안 줄 수 있다. 그대로 부르면 화면 전체가 터진다.
      const who = (c.staffName ?? "").trim();
      const bare = who.length > 0 && !who.includes(" ") && !TITLE_TAIL.test(who);
      const whom = bare ? `${who} 담당자` : who;
      // 만날 사람도 장소도 없으면 그 문장을 아예 만들지 않는다. "에서 를 찾으세요"보다
      // 시간만 알리는 편이 낫다.
      const place = (c.place ?? "").trim();
      if (!who && !place) return "방문 시간이 정해졌어요. 담당자에게 확인해 주세요.";
      const where = place
        ? `${place}에서 ${whom}${josa(whom, "을", "를")} 찾으세요.`
        : `${whom}${josa(whom, "을", "를")} 찾으세요.`;
      // 시각이 비면 시각 이야기를 빼고 만다. 넣으면 "정해진 시간으로 정해졌어요"가 된다.
      if (!c.whenLabel) return `방문 시간이 정해졌어요. ${where}`;
      return `${c.whenLabel}${josa(c.whenLabel, "으로", "로")} 정해졌어요. ${where}`;
    }
    case "reschedule_proposed":
      return request.proposedTime
        ? `담당자가 다른 시간을 이야기했어요. ${request.proposedTime}${josa(request.proposedTime, "은", "는")} 어떠세요?`
        : "담당자가 다른 시간을 이야기했어요.";
    case "completed":
      return "방문을 마쳤어요.";
    case "cancelled":
      return request.cancelReason
        ? `이 요청은 취소됐어요. ${request.cancelReason}`
        : "이 요청은 취소됐어요.";
  }
}

/** 담당자가 확인하기 전에는 채팅을 열지 않는다. 아무도 안 보는 방에 말을 걸게 두지 않는다 (§7.3-4). */
export function canOpenStaffChat(status: VisitStatus): boolean {
  return status === "acknowledged" || status === "confirmed" || status === "reschedule_proposed";
}

/** 아직 답을 기다리는 요청. 남용 방지 상한의 기준이 된다. */
export function isPending(status: VisitStatus): boolean {
  return status === "sent" || status === "acknowledged" || status === "reschedule_proposed";
}

// 남용 방지 상한 (§7.5). 진입 게이트를 없애면서 허위 알림이 실질 위험이 되었다.
export const DAILY_SEND_LIMIT = 3;
/** 실질 방어선이다. 담당자가 아직 확인하지 않은 요청이 다섯 쌓이면 새 요청을 받지 않는다. */
export const PENDING_LIMIT = 5;

export type LimitReason = "daily" | "pending" | "duplicate";

/**
 * 지금 새 요청을 보낼 수 있는지. 막는 이유가 있으면 그 이유를 돌려준다.
 * 진짜 위험은 담당자가 못 받는 것이 아니라 급한 사람의 진짜 요청이 목록 아래로 밀리는 것이다.
 */
/**
 * 오늘 보낸 건수. **보낸 시각을 모르는 요청은 세지 않는다.**
 *
 * 세면 어제 것까지 오늘로 계산되어 멀쩡한 요청이 막힌다. 덜 세는 쪽이 안전한 이유는
 * 판정을 서버가 다시 하기 때문이다 — 화면의 셈은 미리 알려주는 용도다.
 */
export function countSentToday(requests: readonly VisitRequest[], now: Date = new Date()): number {
  const sameDay = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  };
  // **취소·완료된 것은 세지 않는다.** 세면 보내고 취소한 뒤 다시 보낼 때 하루 세 건
  // 중 두 건이 소모되고, 상한이 도움이 아니라 벌칙이 된다. 서버도 답을 기다리는
  // 것만 센다.
  return requests.filter(
    (r) => r.createdAt && sameDay(r.createdAt) && r.status !== "cancelled" && r.status !== "completed",
  ).length;
}

export function blockReason(
  taskId: string,
  todaySentCount: number,
  existing: readonly VisitRequest[],
): LimitReason | null {
  // 확정되지 않은 요청이 이미 있으면 새로 보내지 못하고 기존 것을 고치게 한다.
  if (existing.some((r) => r.taskId === taskId && isPending(r.status))) return "duplicate";
  if (existing.filter((r) => isPending(r.status)).length >= PENDING_LIMIT) return "pending";
  if (todaySentCount >= DAILY_SEND_LIMIT) return "daily";
  return null;
}

/**
 * 사용자가 스스로 물릴 수 있는 상태.
 *
 * **§7.1의 상태 흐름에는 담당자가 하는 취소만 있다.** 사용자가 물리는 길은 적혀 있지
 * 않은데, 서버에는 사용자 토큰으로 부르는 창구가 있다. 못 가게 되는 일은 실제로
 * 생기고, 그때 물릴 길이 없으면 **담당자가 헛되이 기다린다.**
 *
 * 이미 다녀왔거나 이미 취소된 것은 물릴 것이 없다.
 */
export function canCancel(status: VisitStatus): boolean {
  return status !== "completed" && status !== "cancelled";
}

/**
 * 물리기 전에 한 번 더 묻는지.
 *
 * **확정된 요청만 묻는다.** 담당자가 시간과 창구를 비워둔 상태라 무르는 값이 다르다.
 * 아직 확정 전이면 묻지 않는다 — 저리터러시 전제에서 확인 절차가 늘수록 그만두게 된다.
 */
export function cancelNeedsConfirm(status: VisitStatus): boolean {
  return status === "confirmed";
}

/**
 * 상한에 닿아도 그냥 막지 않는다. 다시 보내는 이유는 대개 앞서 보낸 것이 갔는지 모르기 때문이라,
 * 이미 보낸 요청을 함께 보여주는 것이 답이다 (§7.5).
 */
export function limitMessage(reason: LimitReason): string {
  switch (reason) {
    case "duplicate":
      return "이 일로 이미 보낸 요청이 있어요. 답을 기다리고 있어요.";
    case "pending":
      return "답을 기다리는 요청이 다섯 개 있어요. 하나가 정해지면 새로 보내실 수 있어요.";
    case "daily":
      return "오늘은 세 번 보내셨어요. 내일 이어서 보내실 수 있어요.";
  }
}

/**
 * 담당자에게 전달되는 항목 (§7.4). 최소 노출 원칙이다.
 * **죄목과 생일은 보내지 않는다.** 전송 직전에 이 목록을 화면에 그대로 보여준다.
 */
export function sharedItems(
  hasNote: boolean,
  hasDeadlineRoute: boolean,
  hasDocs = true,
  /** 함께 보내기로 한 분야 이름들. 고르지 않았으면 비어 있다 (§7.4-1). */
  sharedSections: readonly string[] = [],
): readonly string[] {
  const items = ["이름", "방문하실 시간 두 가지", "무슨 일로 오시는지"];
  if (hasDocs) items.push("챙겨 오실 것");
  if (hasNote) items.push("하고 싶은 말");
  // 기한이 있는 제도를 상담할 때만 보낸다.
  if (hasDeadlineRoute) items.push("출소한 날짜");
  // **고른 분야를 이름으로 낸다.** "답한 내용"이라고만 적으면 무엇이 가는지 알 수 없다.
  if (sharedSections.length > 0) {
    items.push(`${sharedSections.join("·")} 답하신 내용`);
  }
  return items;
}
