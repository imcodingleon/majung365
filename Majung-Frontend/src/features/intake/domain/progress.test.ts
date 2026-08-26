// **전역이 아니라 가져와서 쓴다.** `expo/tsconfig.base`가 `types`를 좁혀 두어
// `describe`·`it`·`expect`가 전역으로 잡히지 않는다.
import { describe, expect, it } from "@jest/globals";

import { totalToShow } from "./progress";

describe("totalToShow — 진행 막대에 적는 총 개수 (결정 H-4)", () => {
  it("답을 골라 꼬리질문이 열려도 그 자리에서는 안 바뀐다", () => {
    // **막대가 뒤로 밀리는 것처럼 보인다.** "5개 중 3번째"가 답 하나 골랐다고
    // "8개 중 3번째"가 되면 진행하다 만 것으로 읽힌다.
    expect(totalToShow(5, 8, 2, false)).toBe(5);
  });

  it("다음을 누르면 실제 개수로 따라간다", () => {
    // 새 문항을 만나는 순간이라 숫자가 바뀌어도 납득된다.
    expect(totalToShow(5, 8, 3, true)).toBe(8);
  });

  it("답을 바꿔 꼬리질문이 닫혀도 그 자리에서는 안 줄인다", () => {
    expect(totalToShow(8, 5, 2, false)).toBe(5);
  });

  it("지금 보는 자리보다 작게 적지 않는다", () => {
    // "3개 중 5번째"가 되면 무슨 말인지 알 수 없다.
    expect(totalToShow(3, 3, 4, false)).toBe(5);
    expect(totalToShow(8, 2, 6, false)).toBe(7);
  });

  it("이동할 때도 실제 개수를 그대로 쓴다", () => {
    // 이동 뒤에는 화면이 새로 그려지므로 실제 수가 곧 맞는 수다.
    expect(totalToShow(9, 4, 1, true)).toBe(4);
  });

  it("문항이 없으면 최소한 1번째로 읽힌다", () => {
    expect(totalToShow(0, 0, 0, false)).toBe(1);
  });
});
