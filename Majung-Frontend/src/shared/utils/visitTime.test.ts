// **전역이 아니라 가져와서 쓴다.** `expo/tsconfig.base`가 `types`를 좁혀 두어
// `describe`·`it`·`expect`가 전역으로 잡히지 않는다.
import { describe, expect, it } from "@jest/globals";

import { fromIso, isComplete, toIso } from "./visitTime";

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
