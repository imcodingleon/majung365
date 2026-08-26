// **전역이 아니라 가져와서 쓴다.** `expo/tsconfig.base`가 `types`를 좁혀 두어
// `describe`·`it`·`expect`가 전역으로 잡히지 않는다.
import { describe, expect, it } from "@jest/globals";

import { timeLabel } from "./fromServer";

/** 기기 시간대와 무관하게 그 지역 시각으로 읽히는 ISO 문자열을 만든다. */
function localIso(year: number, month: number, day: number, hour: number): string {
  return new Date(year, month - 1, day, hour, 0, 0).toISOString();
}

describe("timeLabel — 담당자가 읽는 방문 시각", () => {
  it("몇 시인지까지 낸다", () => {
    // **"오전"까지만 내면 담당자가 다시 물어야 한다.** 사용자는 시까지 골랐다.
    expect(timeLabel(localIso(2026, 8, 25, 9))).toBe("8월 25일 화요일 오전 9시");
  });

  it("오후는 12를 빼서 부른다", () => {
    expect(timeLabel(localIso(2026, 8, 25, 15))).toBe("8월 25일 화요일 오후 3시");
  });

  it("정오는 낮 12시다", () => {
    // "오후 0시"는 읽히지 않는다.
    expect(timeLabel(localIso(2026, 8, 25, 12))).toBe("8월 25일 화요일 낮 12시");
  });

  it("시각이 없으면 빈 말로 둔다", () => {
    // 아직 때를 안 정한 요청이다. "없음" 같은 말을 대신 지어내지 않는다.
    expect(timeLabel(null)).toBe("");
  });

  it("읽을 수 없는 값이면 빈 말로 둔다", () => {
    expect(timeLabel("어제쯤")).toBe("");
  });
});
