import { describe, expect, it } from "@jest/globals";

import type { VisitRequest, VisitStatus } from "@/features/visit/domain/request";

import { countUnseen, isUnseen, toAlerts, type Alert } from "./alert";

function req(over: Partial<VisitRequest> & { status: VisitStatus }): VisitRequest {
  return {
    id: "v1",
    taskId: "R1",
    wantedAt: "2026-08-28T14:00:00+09:00",
    readyDocs: [],
    createdAt: "2026-08-26T09:00:00+09:00",
    unread: 0,
    ...over,
  } as VisitRequest;
}

const CONFIRMED = {
  whenLabel: "8월 28일 오후 2시",
  staffName: "김담당",
  place: "2층 상담실",
} as const;

describe("toAlerts", () => {
  it("보내기만 한 요청은 알릴 것이 없다", () => {
    expect(toAlerts([req({ status: "sent" })])).toEqual([]);
  });

  it("확인만 하고 아무 말이 없으면 알리지 않는다", () => {
    // 열어 봐도 볼 것이 없는 알림은 사용자를 헛되이 부른다.
    expect(toAlerts([req({ status: "acknowledged" })])).toEqual([]);
  });

  it("확정되면 만날 사람과 장소를 함께 알린다", () => {
    const list = toAlerts([req({ status: "confirmed", confirmation: CONFIRMED })]);
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("confirmed");
    expect(list[0].body).toContain("김담당");
    expect(list[0].body).toContain("2층 상담실");
    expect(list[0].body).toContain("8월 28일 오후 2시");
  });

  it("확정 정보가 없으면 확정 알림을 만들지 않는다", () => {
    // 만날 사람과 장소가 이 알림의 전부다. 빠지면 알릴 내용이 없다 (§7.1).
    expect(toAlerts([req({ status: "confirmed" })])).toEqual([]);
  });

  it("다른 시간을 제안하면 그 시간을 함께 알린다", () => {
    const list = toAlerts([
      req({ status: "reschedule_proposed", proposedTime: "8월 29일 오전 10시" }),
    ]);
    expect(list[0].kind).toBe("proposed");
    expect(list[0].body).toContain("8월 29일 오전 10시");
  });

  it("취소되면 이유를 그대로 알린다", () => {
    const list = toAlerts([req({ status: "cancelled", cancelReason: "그날 기관이 쉽니다." })]);
    expect(list[0].kind).toBe("cancelled");
    expect(list[0].body).toContain("그날 기관이 쉽니다.");
  });

  it("최근 것이 위로 온다", () => {
    const list = toAlerts([
      req({ id: "old", status: "cancelled", createdAt: "2026-08-24T09:00:00+09:00" }),
      req({ id: "new", status: "cancelled", createdAt: "2026-08-26T09:00:00+09:00" }),
    ]);
    expect(list.map((a) => a.visitId)).toEqual(["new", "old"]);
  });

  it("한 요청에서 두 알림이 겹치지 않는다", () => {
    // 상태는 하나뿐이므로 요청 하나가 알림 둘을 만들면 같은 일이 두 번 보인다.
    const list = toAlerts([req({ status: "confirmed", confirmation: CONFIRMED })]);
    expect(list).toHaveLength(1);
  });
});

describe("countUnseen", () => {
  const alerts: Alert[] = [
    {
      id: "1",
      kind: "confirmed",
      title: "",
      body: "",
      at: "2026-08-26T10:00:00+09:00",
      visitId: "a",
    },
    {
      id: "2",
      kind: "cancelled",
      title: "",
      body: "",
      at: "2026-08-25T10:00:00+09:00",
      visitId: "b",
    },
  ];

  it("한 번도 안 봤으면 전부 안 읽은 것이다", () => {
    expect(countUnseen(alerts, null)).toBe(2);
  });

  it("마지막으로 본 시각보다 늦은 것만 센다", () => {
    expect(countUnseen(alerts, "2026-08-25T12:00:00+09:00")).toBe(1);
  });

  it("전부 본 뒤에는 0이다", () => {
    expect(countUnseen(alerts, "2026-08-27T00:00:00+09:00")).toBe(0);
  });

  it("본 시각과 알림 시각이 같으면 읽은 것으로 센다", () => {
    // 같은 순간에 온 것을 안 읽은 것으로 세면 배지가 영영 사라지지 않는다.
    expect(countUnseen(alerts, "2026-08-26T10:00:00+09:00")).toBe(0);
  });

  it("알림이 없으면 0이다", () => {
    expect(countUnseen([], null)).toBe(0);
  });
});

describe("toAlerts — 안 읽은 메시지", () => {
  it("안 읽은 말이 있으면 그것을 알린다", () => {
    const list = toAlerts([req({ status: "acknowledged", unread: 2 })]);
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("message");
    expect(list[0].body).toContain("2개");
  });

  it("한 건이면 개수를 세지 않는다", () => {
    const list = toAlerts([req({ status: "acknowledged", unread: 1 })]);
    expect(list[0].body).toBe("새 메시지가 있어요.");
  });

  it("확정된 요청에 새 말이 오면 말 쪽을 알린다", () => {
    // 이미 본 확정 소식보다 방금 온 말이 먼저다.
    const list = toAlerts([
      req({ status: "confirmed", confirmation: CONFIRMED, unread: 1 }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("message");
  });

  it("다 읽었으면 상태 소식으로 돌아간다", () => {
    const list = toAlerts([
      req({ status: "confirmed", confirmation: CONFIRMED, unread: 0 }),
    ]);
    expect(list[0].kind).toBe("confirmed");
  });
});

describe("countUnseen — 두 종류의 안 읽음", () => {
  const message: Alert = {
    id: "m",
    kind: "message",
    title: "",
    body: "",
    // 요청을 보낸 시각이라 알림 화면을 지나친 뒤보다 과거다.
    at: "2026-08-20T09:00:00+09:00",
    visitId: "a",
  };

  it("메시지는 본 시각과 무관하게 안 읽은 것이다", () => {
    // 서버가 세는 값이 곧 안 읽음의 정의다. 기기 시각으로 다시 거르면 알림 화면을
    // 한 번 지나친 뒤에 온 메시지가 배지에서 사라진다.
    expect(countUnseen([message], "2026-08-26T23:00:00+09:00")).toBe(1);
  });

  it("나머지 소식은 본 시각으로 거른다", () => {
    const confirmed: Alert = { ...message, id: "c", kind: "confirmed" };
    expect(countUnseen([confirmed], "2026-08-26T23:00:00+09:00")).toBe(0);
  });

  it("목록의 점과 바의 숫자가 같은 판정을 쓴다", () => {
    const seenAt = "2026-08-26T23:00:00+09:00";
    expect(isUnseen(message, seenAt)).toBe(true);
    expect(countUnseen([message], seenAt)).toBe(1);
  });
});
