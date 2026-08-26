// **전역이 아니라 가져와서 쓴다.** `expo/tsconfig.base`가 `types`를 좁혀 두어
// `describe`·`it`·`expect`가 전역으로 잡히지 않는다.
import { beforeEach, describe, expect, it } from "@jest/globals";

import { lastAnswers, markAnswers } from "./storage";

/** 브라우저의 `localStorage` 자리. 이 파일에서만 쓰는 최소 구현이다. */
function useFakeStorage(): void {
  const box = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => box.get(k) ?? null,
      setItem: (k: string, v: string) => void box.set(k, v),
      removeItem: (k: string) => void box.delete(k),
    },
  };
}

/** 저장을 거치지 않고 값을 직접 심는다. 깨진 값을 넣어 보려면 이 길이 필요하다. */
function plant(raw: string): void {
  (globalThis as { window: { localStorage: Storage } }).window.localStorage.setItem(
    "majung365.answers",
    raw,
  );
}

describe("초기 진단 답변 남기기 (§7.4-1 · 2026-08-26 결정 G-1)", () => {
  beforeEach(useFakeStorage);

  it("남긴 답을 그대로 되살린다", () => {
    // **이것이 없으면 새로고침 한 번에 담당자에게 알릴 내용이 사라진다.** 서버에는
    // 판정만 있고 답변 원문이 없어서(§9.1) 되살릴 곳이 여기뿐이다.
    const answered = { Q1: "네", Q7: ["주거", "일자리"] };
    markAnswers(answered);
    expect(lastAnswers()).toEqual(answered);
  });

  it("아직 답한 적이 없으면 없다고 한다", () => {
    expect(lastAnswers()).toBeNull();
  });

  it("다시 답하면 통째로 덮어쓴다", () => {
    // 옛 답이 섞이면 담당자에게 지금 상황이 아닌 것을 알리게 된다.
    markAnswers({ Q1: "네", Q2: "아니요" });
    markAnswers({ Q1: "아니요" });
    expect(lastAnswers()).toEqual({ Q1: "아니요" });
  });

  it("깨진 값이 들어 있으면 없는 것으로 친다", () => {
    plant("{ 이건 JSON이 아니다");
    expect(lastAnswers()).toBeNull();
  });

  it("남의 형식이면 없는 것으로 친다", () => {
    // 배열이나 숫자가 들어 있으면 문항을 되짚을 수 없다.
    plant(JSON.stringify(["네", "아니요"]));
    expect(lastAnswers()).toBeNull();
  });

  it("문자열도 배열도 아닌 답은 버리고 나머지는 살린다", () => {
    // **한 칸이 깨졌다고 전부 버리지 않는다.** 옛 형식이 섞여 들어와도 답한 것은
    // 최대한 살려야 화면이 통째로 사라지지 않는다.
    plant(JSON.stringify({ Q1: "네", Q2: 42, Q3: ["주거"] }));
    expect(lastAnswers()).toEqual({ Q1: "네", Q3: ["주거"] });
  });

  it("살릴 것이 하나도 없으면 없다고 한다", () => {
    plant(JSON.stringify({ Q1: 42, Q2: null }));
    expect(lastAnswers()).toBeNull();
  });
});
