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

  // **확인만 한 것은 알리지 않는다.** 이 상태에서 채팅방이 열리므로 담당자가 말을
  // 걸면 그때 메시지 알림이 나간다. 확인만 하고 아무 말이 없는 것을 알리면 열어 봐도
  // 볼 것이 없다.

  if (r.status === "confirmed") {
    // **만날 사람과 장소가 이 알림의 전부다**(§7.1). 없으면 알릴 내용이 없다.
    if (!r.confirmation) return null;
    const { whenLabel, staffName, place } = r.confirmation;
    return {
      id: `${r.id}:confirmed`,
      kind: "confirmed",
      title: "방문이 확정되었어요",
      body: `${whenLabel}에 ${staffName}을 ${place}에서 만나요.`,
      at,
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

/** 최근 것이 위로 온다. */
export function toAlerts(requests: readonly VisitRequest[]): Alert[] {
  return requests
    .map(alertFor)
    .filter((a): a is Alert => a !== null)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * 안 읽은 건수.
 *
 * **본 시각과 같은 것은 읽은 것으로 센다.** 같은 순간에 온 것을 안 읽은 것으로 세면
 * 배지가 영영 사라지지 않는다.
 */
export function countUnseen(alerts: readonly Alert[], lastSeen: string | null): number {
  if (lastSeen === null) return alerts.length;
  return alerts.filter((a) => a.at > lastSeen).length;
}
