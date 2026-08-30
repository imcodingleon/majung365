// **전역이 아니라 가져와서 쓴다.** `expo/tsconfig.base`가 `types`를 좁혀 두어
// `describe`·`it`·`expect`가 전역으로 잡히지 않는다.
import { describe, expect, it } from "@jest/globals";

import type { StaffVisitResponse } from "@/shared/types/staffVisit";

import { timeLabel, toStaffRequest } from "./fromServer";

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

/** 서버가 주는 최소 형태. 여기 없는 것은 화면이 기본값으로 채워야 한다. */
function baseResponse(): StaffVisitResponse {
  return {
    id: "r-1",
    route_id: "R9",
    status: "sent",
    user_name: "김판수",
    preferred_at_1: localIso(2026, 8, 25, 9),
    preferred_at_2: null,
    prepared_docs: [],
    note: "",
    meeting_place: "",
    confirmed_for: null,
    created_at: localIso(2026, 8, 24, 10),
  };
}

describe("toStaffRequest — 간추린 내용", () => {
  it("요약을 붙이기 전에 보낸 요청도 그대로 열린다", () => {
    // **옛 응답에는 두 필드가 아예 없다.** 없는 것을 없는 대로 읽어야 담당자가
    // 답변 원문을 그대로 본다 — 여기서 undefined가 새어 나가면 화면이 깨진다.
    const request = toStaffRequest(baseResponse());

    expect(request.summary).toBe("");
    expect(request.summaryStatus).toBe("none");
  });

  it("만드는 중이라는 것도 그대로 옮긴다", () => {
    // 화면이 이 값을 보고 "만들고 있습니다"를 띄우고 잠시 뒤 다시 부른다.
    const request = toStaffRequest({ ...baseResponse(), summary_status: "pending" });

    expect(request.summaryStatus).toBe("pending");
    expect(request.summary).toBe("");
  });

  it("만들어진 요약은 문장 그대로 온다", () => {
    const request = toStaffRequest({
      ...baseResponse(),
      summary: "본인은 신분증이 없어 재발급을 받으러 오십니다.",
      summary_status: "ready",
    });

    expect(request.summary).toBe("본인은 신분증이 없어 재발급을 받으러 오십니다.");
    expect(request.summaryStatus).toBe("ready");
  });
});
