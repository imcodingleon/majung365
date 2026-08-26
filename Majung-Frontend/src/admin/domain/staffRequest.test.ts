// **전역이 아니라 가져와서 쓴다.** `expo/tsconfig.base`가 `types`를 좁혀 두어
// `describe`·`it`·`expect`가 전역으로 잡히지 않는다.
import { describe, expect, it } from "@jest/globals";

import { canConfirm, type ConfirmInput } from "./staffRequest";

const full: ConfirmInput = {
  staffName: "최다은",
  place: "2층 상담실",
  whenIso: "2026-08-28T05:00:00.000Z",
};

describe("canConfirm — 확정할 수 있는가", () => {
  it("때와 사람과 장소가 다 있으면 확정한다", () => {
    expect(canConfirm(full)).toBe(true);
  });

  it("때를 덜 골랐으면 확정하지 않는다", () => {
    // **서버가 대신 채워 주던 자리를 담당자가 정하기로 했다** (2026-08-26 결정).
    // 덜 고른 채로 보내면 무엇으로 확정됐는지 아무도 모른다.
    expect(canConfirm({ ...full, whenIso: null })).toBe(false);
  });

  it("만날 사람이 없으면 확정하지 않는다", () => {
    // §7.1이 "이 기능의 핵심"이라고 적은 둘이다. 공백만 적은 것도 없는 것이다.
    expect(canConfirm({ ...full, staffName: "   " })).toBe(false);
  });

  it("만날 장소가 없으면 확정하지 않는다", () => {
    expect(canConfirm({ ...full, place: "" })).toBe(false);
  });
});
