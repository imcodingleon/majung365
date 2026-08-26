import { describe, expect, it } from "@jest/globals";

import type { VisitRequest, VisitStatus } from "@/features/visit/domain/request";

import {
  countUnseen,
  dayLabel,
  groupByDay,
  isUnseen,
  timeLabel,
  toAlerts,
  type Alert,
} from "./alert";

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

describe("날짜로 묶고 지난 약속은 내린다 (2026-08-26 결정 G-5)", () => {
  /** 그날 정오. 기기 시간대 기준으로 만든다. */
  const noonOf = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

  const confirmed = (whenIso: string, decidedAt: string) =>
    req({
      status: "confirmed",
      confirmation: { ...CONFIRMED, whenIso, decidedAt },
    });

  it("약속한 날까지는 남는다", () => {
    // **"약속 시간이 언제였지?" 할 때 눌러 보는 것이 이 목록의 쓸모다.**
    // 확인하자마자 사라지면 그 쓸모가 없어진다.
    const visit = noonOf(2026, 8, 28).toISOString();
    const list = toAlerts([confirmed(visit, visit)], noonOf(2026, 8, 28));
    expect(list.map((a) => a.kind)).toEqual(["confirmed"]);
  });

  it("약속 시간이 지나도 그날 안에는 남는다", () => {
    // 오후 2시 약속이 오후 3시에 사라지면 그날 안에 다시 볼 수 없다.
    const visit = new Date(2026, 7, 28, 14, 0, 0).toISOString();
    const list = toAlerts([confirmed(visit, visit)], new Date(2026, 7, 28, 18, 0, 0));
    expect(list).toHaveLength(1);
  });

  it("그날이 지나면 내린다", () => {
    // 지난 약속이 계속 위에 남아 있으면 다음 소식이 묻힌다.
    const visit = noonOf(2026, 8, 28).toISOString();
    const list = toAlerts([confirmed(visit, visit)], noonOf(2026, 8, 29));
    expect(list).toEqual([]);
  });

  it("안 읽은 메시지가 있으면 지난 약속이어도 남긴다", () => {
    // 담당자가 방문 뒤에 말을 걸 수 있다. 그 말이 목록에서 사라지면 안 된다.
    const visit = noonOf(2026, 8, 20).toISOString();
    const withMessage = req({
      status: "confirmed",
      unread: 1,
      confirmation: { ...CONFIRMED, whenIso: visit, decidedAt: visit },
    });
    const list = toAlerts([withMessage], noonOf(2026, 8, 29));
    expect(list.map((a) => a.kind)).toEqual(["message"]);
  });

  it("취소 소식은 날짜와 무관하게 남는다", () => {
    // 왜 취소됐는지는 나중에 다시 읽을 것이 있다.
    const list = toAlerts(
      [req({ status: "cancelled", cancelReason: "그날은 문을 닫아요." })],
      noonOf(2026, 12, 31),
    );
    expect(list).toHaveLength(1);
  });

  it("확정 소식의 시각은 확정을 누른 때다", () => {
    // 요청을 보낸 때를 쓰면 며칠 전 요청이 확정되어도 목록 아래에 묻힌다.
    const decided = new Date(2026, 7, 27, 10, 0, 0).toISOString();
    const list = toAlerts(
      [confirmed(noonOf(2026, 8, 28).toISOString(), decided)],
      noonOf(2026, 8, 27),
    );
    expect(list[0].at).toBe(decided);
  });
});

describe("dayLabel · groupByDay", () => {
  const now = new Date(2026, 7, 26, 12, 0, 0);

  it("오늘과 어제는 날짜로 적지 않는다", () => {
    // "8월 26일"보다 "오늘"이 먼저 읽힌다.
    expect(dayLabel(new Date(2026, 7, 26, 9, 0, 0).toISOString(), now)).toBe("오늘");
    expect(dayLabel(new Date(2026, 7, 25, 9, 0, 0).toISOString(), now)).toBe("어제");
  });

  it("그 전은 날짜와 요일로 적는다", () => {
    expect(dayLabel(new Date(2026, 7, 24, 9, 0, 0).toISOString(), now)).toBe("8월 24일 월요일");
  });

  it("읽을 수 없는 값이면 빈 말로 둔다", () => {
    // 날짜를 지어내면 그것이 곧 틀린 정보가 된다.
    expect(dayLabel("어제쯤", now)).toBe("");
    expect(dayLabel("", now)).toBe("");
  });

  it("같은 날 온 것을 한 묶음으로 낸다", () => {
    const alerts = [
      { id: "a", kind: "confirmed", title: "", body: "", visitId: "v", at: new Date(2026, 7, 26, 9).toISOString() },
      { id: "b", kind: "cancelled", title: "", body: "", visitId: "v", at: new Date(2026, 7, 26, 8).toISOString() },
      { id: "c", kind: "cancelled", title: "", body: "", visitId: "v", at: new Date(2026, 7, 24, 8).toISOString() },
    ] as Alert[];
    const days = groupByDay(alerts, now);
    expect(days.map((d) => [d.label, d.items.length])).toEqual([
      ["오늘", 2],
      ["8월 24일 월요일", 1],
    ]);
  });

  it("시각을 모르는 소식은 따로 모은다", () => {
    const alerts = [
      { id: "a", kind: "cancelled", title: "", body: "", visitId: "v", at: "" },
    ] as Alert[];
    expect(groupByDay(alerts, now)[0].label).toBe("언제인지 모름");
  });
});

describe("timeLabel", () => {
  it("오전·오후로 읽는다", () => {
    expect(timeLabel(new Date(2026, 7, 26, 9, 5, 0).toISOString())).toBe("오전 9시 05분");
    expect(timeLabel(new Date(2026, 7, 26, 14, 30, 0).toISOString())).toBe("오후 2시 30분");
  });

  it("정오는 낮 12시가 아니라 오후 12시로 둔다", () => {
    // 알림 시각은 기록이라 읽기 쉬움보다 정확한 시계 표기가 낫다.
    expect(timeLabel(new Date(2026, 7, 26, 12, 0, 0).toISOString())).toBe("오후 12시 00분");
  });

  it("읽을 수 없으면 빈 말로 둔다", () => {
    expect(timeLabel("방금")).toBe("");
  });
});
