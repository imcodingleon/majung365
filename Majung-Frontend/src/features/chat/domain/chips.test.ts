// 칩 자리에 무엇이 뜨는가 (§6.1).
//
// **값이 맞아도 화면에 안 뜨는 것은 Playwright가 보고, 무엇이 뜰지 정하는 계산은
// 여기서 본다.** 이 갈림이 틀리면 대화를 이미 나눈 사람에게 "오늘 뭐 해야 해요?"가
// 다시 뜨고, 사용자는 앞의 답이 지워진 줄 안다.
import { describe, expect, it } from "@jest/globals";


import { PRESETS, chipsFor, takeThree } from "./chips";

const STARTERS = ["어디서 지낼 수 있어요?", "얼마나 지낼 수 있어요?", "돈을 내야 하나요?"];
const SUGGESTED = ["언제쯤 나와요?", "무엇을 챙겨 가요?", "다른 것도 되나요?"];

describe("chipsFor — 대화가 아직 없을 때", () => {
  it("그 할 일의 첫 질문을 낸다", () => {
    expect(chipsFor({ hasMessages: false, starterQuestions: STARTERS })).toEqual(STARTERS);
  });

  it("서버가 첫 질문을 안 보내면 기본 문구로 물러선다", () => {
    // 옛 배포본이거나 표에 없는 항목이다. 칩 자리가 통째로 비면 안 된다.
    expect(chipsFor({ hasMessages: false, starterQuestions: [] })).toEqual(PRESETS);
    expect(chipsFor({ hasMessages: false })).toEqual(PRESETS);
  });

  it("공백만 든 문장은 버린다", () => {
    expect(chipsFor({ hasMessages: false, starterQuestions: ["  ", ""] })).toEqual(PRESETS);
  });

  it("첫 질문이 넷이어도 그대로 낸다", () => {
    // 제안은 셋이지만 첫 질문은 서버 표가 정한 개수를 그대로 따른다.
    const four = [...STARTERS, "무엇을 챙겨 가요?"];
    expect(chipsFor({ hasMessages: false, starterQuestions: four })).toHaveLength(4);
  });
});

describe("chipsFor — 대화가 오간 뒤", () => {
  it("AI가 제안한 다음 질문을 낸다", () => {
    expect(
      chipsFor({ hasMessages: true, starterQuestions: STARTERS, suggestions: SUGGESTED }),
    ).toEqual(SUGGESTED);
  });

  it("제안이 없으면 빈 채로 둔다 — 첫 질문으로 되돌아가지 않는다", () => {
    // 되돌아가면 이미 답한 질문이 다시 뜬다. 화면은 이 빈 배열을 보고 칩 자리를
    // 아예 만들지 않는다.
    expect(chipsFor({ hasMessages: true, starterQuestions: STARTERS, suggestions: [] })).toEqual([]);
    expect(chipsFor({ hasMessages: true, starterQuestions: STARTERS })).toEqual([]);
  });

  it("넷 이상 와도 앞의 셋만 낸다", () => {
    const four = [...SUGGESTED, "이것도 되나요?"];
    expect(chipsFor({ hasMessages: true, suggestions: four })).toEqual(SUGGESTED);
  });
});

describe("takeThree", () => {
  it("앞뒤 공백을 떼고 빈 문장을 버린다", () => {
    expect(takeThree([" 언제쯤 나와요? ", "", "  "])).toEqual(["언제쯤 나와요?"]);
  });

  it("받은 것이 없으면 빈 배열이다", () => {
    expect(takeThree(undefined)).toEqual([]);
  });
});
