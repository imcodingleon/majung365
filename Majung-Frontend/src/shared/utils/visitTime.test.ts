// **전역이 아니라 가져와서 쓴다.** `expo/tsconfig.base`가 `types`를 좁혀 두어
// `describe`·`it`·`expect`가 전역으로 잡히지 않는다.
import { describe, expect, it } from "@jest/globals";

import { fromIso, isComplete, monthsFrom, pickableDays, toIso } from "./visitTime";

describe("fromIso — 담당자 화면의 처음 값", () => {
  it("출소자가 적어낸 때를 칸에 그대로 놓는다", () => {
    // **빈 칸에서 시작하면 담당자가 옮겨 적어야 한다.** 그 자리에서 고칠 수 있게
    // 처음 값을 채워 둔다 (§7.2 · 2026-08-26 결정).
    const at = new Date(2026, 7, 28, 14, 0, 0);
    expect(fromIso(at.toISOString())).toEqual({ year: 2026, month: 8, day: 28, hour: 14 });
  });

  it("때가 없으면 빈 칸이다", () => {
    expect(fromIso(null)).toEqual({});
    expect(fromIso(undefined)).toEqual({});
    expect(fromIso("")).toEqual({});
  });

  it("읽을 수 없는 값이면 빈 칸이다", () => {
    // **지어낸 시각으로 확정되면 안 된다.** 덜 골랐다고 알려 확정을 막는 편이 낫다.
    expect(fromIso("내일쯤")).toEqual({});
  });

  it("되돌린 값을 다시 ISO로 만들면 같은 때다", () => {
    const at = new Date(2026, 7, 28, 9, 0, 0);
    expect(toIso(fromIso(at.toISOString()))).toBe(at.toISOString());
  });
});

describe("isComplete — 확정할 수 있는가", () => {
  it("네 칸이 다 차야 한다", () => {
    expect(isComplete({ year: 2026, month: 8, day: 28, hour: 14 })).toBe(true);
  });

  it("한 칸이라도 비면 아니다", () => {
    expect(isComplete({ year: 2026, month: 8, day: 28 })).toBe(false);
    expect(isComplete({})).toBe(false);
  });
});

describe("monthsFrom — 고를 수 있는 달", () => {
  it("이번 달에 갈 수 있는 날이 남아 있으면 이번 달부터 낸다", () => {
    expect(monthsFrom(new Date(2026, 7, 15)).map((m) => m.value)).toEqual([8, 9, 10]);
  });

  it("말일에는 이번 달을 아예 내지 않는다", () => {
    // **당일 방문을 막고 있으므로 말일에는 이번 달에 갈 수 있는 날이 없다.**
    // 그 달을 목록에 두면 골라 들어가 봐야 전부 흐린 줄만 나온다.
    expect(monthsFrom(new Date(2026, 7, 31)).map((m) => m.value)).toEqual([9, 10]);
    // 30일까지인 달도 마찬가지다.
    expect(monthsFrom(new Date(2026, 8, 30)).map((m) => m.value)).toEqual([10, 11]);
  });

  it("연말을 넘어가면 내년 달이 이어진다", () => {
    expect(monthsFrom(new Date(2026, 10, 15))).toEqual([
      { value: 11, year: 2026 },
      { value: 12, year: 2026 },
      { value: 1, year: 2027 },
    ]);
  });

  it("말일이 연말이면 내년 달만 남는다", () => {
    expect(monthsFrom(new Date(2026, 11, 31))).toEqual([
      { value: 1, year: 2027 },
      { value: 2, year: 2027 },
    ]);
  });
});

describe("pickableDays — 당일과 지난 날은 막는다", () => {
  const today = new Date(2026, 7, 15);

  it("오늘은 고를 수 없다", () => {
    // 담당자가 확인하고 답하는 시간이 필요해서, 당일 방문은 "미리 알린다"는 이
    // 기능이 하려는 일과 맞지 않는다.
    const days = pickableDays(2026, 8, today);
    expect(days.find((d) => d.value === 15)?.disabled).toBe(true);
  });

  it("내일부터 고를 수 있다", () => {
    const days = pickableDays(2026, 8, today);
    expect(days.find((d) => d.value === 16)?.disabled).toBe(false);
  });

  it("고를 수 없는 날도 목록에 남긴다", () => {
    // 빼 버리면 날짜가 건너뛰어 보여 무슨 일인지 알 수 없다.
    expect(pickableDays(2026, 8, today)).toHaveLength(31);
  });
});
