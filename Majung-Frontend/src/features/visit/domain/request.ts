// 담당자 방문 요청 (§7).
//
// 상태가 없으면 사용자는 보내놓고 아무것도 모르는 채 기다리게 된다. 그래서 요청이 어떤 상태를
// 거치는지, 각 상태에서 무엇이 보이는지를 도메인에 못 박는다.

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
};

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
      return `${c.whenLabel}으로 정해졌어요. ${c.place}에서 ${c.staffName} 담당자를 찾으세요.`;
    }
    case "reschedule_proposed":
      return request.proposedTime
        ? `담당자가 다른 시간을 이야기했어요. ${request.proposedTime}은 어떠세요?`
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
): readonly string[] {
  const items = ["이름", "방문하실 시간 두 가지", "무슨 일로 오시는지"];
  if (hasDocs) items.push("챙겨 오실 준비물");
  if (hasNote) items.push("적어주신 하고 싶은 말");
  // 기한이 있는 제도를 상담할 때만 보낸다.
  if (hasDeadlineRoute) items.push("출소한 날짜");
  return items;
}
