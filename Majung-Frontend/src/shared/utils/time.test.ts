import { describe, expect, it } from "@jest/globals";

import { clockLabel, listWhenLabel } from "./time";

describe("clockLabel", () => {
  it("오전과 오후를 가르고 두 자리로 맞춘다", () => {
    expect(clockLabel("2026-08-31T08:16:00+09:00")).toBe("오전 08:16");
    expect(clockLabel("2026-08-31T14:05:00+09:00")).toBe("오후 02:05");
  });

  it("자정과 정오는 12시로 적는다", () => {
    // 0시로 적으면 시계에 없는 숫자가 나온다.
    expect(clockLabel("2026-08-31T00:30:00+09:00")).toBe("오전 12:30");
    expect(clockLabel("2026-08-31T12:00:00+09:00")).toBe("오후 12:00");
  });

  it("값이 없거나 망가졌으면 빈 문자열이다", () => {
    expect(clockLabel(null)).toBe("");
    expect(clockLabel("어제쯤")).toBe("");
  });
});

describe("listWhenLabel", () => {
  const now = new Date("2026-08-31T09:00:00+09:00");

  it("오늘 것은 시각으로 낸다", () => {
    expect(listWhenLabel("2026-08-31T05:40:00+09:00", now)).toBe("오전 05:40");
  });

  it("어제 것은 '어제'라고 적는다", () => {
    // 날짜로 적는 것보다 한 단어가 먼저 읽힌다.
    expect(listWhenLabel("2026-08-30T23:50:00+09:00", now)).toBe("어제");
  });

  it("그 전은 날짜로 낸다", () => {
    // **시각만 내면 지난 것이 오늘 일로 읽힌다.** 닷새 전 대화가 "오전 06:10"으로
    // 떠서 오늘 아침 것과 구별되지 않았다.
    expect(listWhenLabel("2026-08-26T06:10:00+09:00", now)).toBe("8월 26일");
  });

  it("몇 시간 차이여도 날짜가 바뀌면 어제다", () => {
    // 시간 간격이 아니라 날짜 경계로 가른다. 새벽 1시에 보는 어제 밤 11시는 어제다.
    const dawn = new Date("2026-08-31T01:00:00+09:00");
    expect(listWhenLabel("2026-08-30T23:00:00+09:00", dawn)).toBe("어제");
  });

  it("앞선 시각이 와도 오늘로 친다", () => {
    // 서버와 기기의 시계가 어긋나면 생긴다. "-1일 뒤"라고 적을 자리가 아니다.
    expect(listWhenLabel("2026-09-01T10:00:00+09:00", now)).toBe("오전 10:00");
  });

  it("값이 없으면 빈 문자열이다", () => {
    expect(listWhenLabel(null, now)).toBe("");
  });
});
