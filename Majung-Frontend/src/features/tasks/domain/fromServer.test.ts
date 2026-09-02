// **전역이 아니라 가져와서 쓴다.** `expo/tsconfig.base`가 `types`를 좁혀 두어
// `describe`·`it`·`expect`가 전역으로 잡히지 않는다.
import { describe, expect, it } from "@jest/globals";

import type { IntakeTask, RouteNotice } from "@/shared/types/intake";

import { toTask } from "./fromServer";

function task(over: Partial<IntakeTask> = {}): IntakeTask {
  return {
    route_id: "R10",
    route_label: "통장",
    tab_label: "통장",
    section_id: "S3",
    section_label: "신분·행정에서 해요",
    blocks_others: false,
    can_request_visit: false,
    card: {
      institution_id: "bank_account",
      name: "통장 개설",
      summary_easy: "은행에서 본인 명의 통장을 만듭니다.",
      docs: ["신분 확인 서류"],
      deadline: null,
      source_url: "",
      benefit_summary: "",
      eligibility: [],
      steps: [],
      cautions: [],
      options: [],
      source_urls: [],
      verified_note: "",
    },
    ...over,
  };
}

function notice(over: Partial<RouteNotice> = {}): RouteNotice {
  return {
    tone: "caution",
    headline: "한도제한계좌 안내",
    body: "새 계좌가 한도제한계좌로 열릴 수 있습니다.",
    myth: "법으로 막히지는 않아요.",
    what_to_do: "급여 계좌라고 말씀해 주세요.",
    sources: [
      {
        label: "전기통신금융사기법 제13조의2",
        url: "https://www.law.go.kr/x",
        quote: "접근매체를 양도·대여하거나 질권을 설정한 자로서",
      },
    ],
    verified_note: "이 안내는 마중365가 9월 2일에 확인했어요.",
    ...over,
  };
}

describe("toTask — 수용 사유 안내 (§9.4)", () => {
  it("안내를 info에 섞지 않는다", () => {
    // **info의 각 줄에는 체크 표시가 붙는다.** 주의 문구가 체크를 달면 사용자에게
    // "이미 끝낸 일"로 읽힌다. 화면이 따로 그려야 하므로 자리도 따로 있어야 한다.
    const result = toTask(task({ notices: [notice()] }));

    expect(result.notices).toHaveLength(1);
    expect(result.info.join(" ")).not.toContain("한도제한계좌");
  });

  it("서버가 안 보내면 빈 목록이다", () => {
    // 수용 사유를 밝히지 않았거나 그 항목에 걸리는 제약이 없는 경우가 대부분이고,
    // 서버가 아직 이 필드를 안 보내는 배포본도 있다. **없는 것이 정상 경로다.**
    expect(toTask(task()).notices).toEqual([]);
  });

  it("안내를 손대지 않고 그대로 옮긴다", () => {
    // **화면이 문장을 조립하지 않는다.** 사람이 검수한 문장이 그대로 나가야 하며,
    // 여기서 이어 붙이거나 자르면 검수를 거치지 않은 법률 안내가 생긴다.
    const given = notice({ tone: "blocked", myth: "" });

    expect(toTask(task({ notices: [given] })).notices[0]).toEqual(given);
  });

  it("조문 원문을 함께 나른다", () => {
    // **쉬운 말 다음에 원문이 온다.** 풀어 쓴 문장만 있으면 사용자가 우리 해석을
    // 그대로 믿어야 하는데, 원문이 있으면 창구에서 그 문장을 짚어 보일 수도 있다.
    const result = toTask(task({ notices: [notice()] }));

    expect(result.notices[0].sources[0].quote).toContain("접근매체");
  });

  it("여러 건이 와도 순서를 지킨다", () => {
    // 서버가 무거운 것부터 정렬해 보낸다. 화면이 다시 섞으면 그 판단이 사라진다.
    const first = notice({ headline: "취업 제한", tone: "blocked" });
    const second = notice({ headline: "해당 여부", tone: "clear" });

    const result = toTask(task({ notices: [first, second] }));

    expect(result.notices.map((n) => n.headline)).toEqual(["취업 제한", "해당 여부"]);
  });
});
