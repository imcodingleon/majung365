// **전역이 아니라 가져와서 쓴다.** `expo/tsconfig.base`가 `types`를 좁혀 두어
// `describe`·`it`·`expect`가 전역으로 잡히지 않는다. 여기서 가져오면 앱 쪽 설정을
// 건드리지 않고도 타입이 맞는다.
import { describe, expect, it } from "@jest/globals";

import type { VisitRequest, VisitStatus } from "@/features/visit/domain/request";

import type { ChatMessage } from "./chatMessage";
import { toConversations } from "./conversation";

function req(over: Partial<VisitRequest> & { status: VisitStatus }): VisitRequest {
  return {
    id: "v1",
    taskId: "R1",
    firstChoice: "2026-08-28T14:00:00+09:00",
    readyDocs: [],
    createdAt: "2026-08-26T09:00:00+09:00",
    ...over,
  } as VisitRequest;
}

const titleOf = (id: string) => ({ R1: "숙식제공", R11: "주민등록 주소" })[id];

describe("toConversations — 담당자 대화", () => {
  it("담당자가 확인하기 전에는 목록에 내지 않는다", () => {
    // 방이 열리지 않은 대화를 목록에 두면 눌러도 거절 문구만 나온다 (§7.3-4).
    expect(toConversations([req({ status: "sent" })], {}, titleOf)).toEqual([]);
  });

  it("취소되거나 끝난 요청도 내지 않는다", () => {
    const gone = toConversations(
      [req({ id: "a", status: "cancelled" }), req({ id: "b", status: "completed" })],
      {},
      titleOf,
    );
    expect(gone).toEqual([]);
  });

  it("확인함부터 목록에 오른다", () => {
    const list = toConversations([req({ status: "acknowledged" })], {}, titleOf);
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("staff");
  });

  it("확정되면 만날 사람 이름을 제목으로 쓴다", () => {
    const list = toConversations(
      [
        req({
          status: "confirmed",
          confirmation: { whenLabel: "8월 28일 오후 2시", staffName: "김담당", place: "2층 상담실" },
        }),
      ],
      {},
      titleOf,
    );
    expect(list[0].title).toBe("김담당");
  });

  it("확정 전에는 직함으로 부른다", () => {
    const list = toConversations([req({ status: "acknowledged" })], {}, titleOf);
    expect(list[0].title).toBe("담당자");
  });
});

describe("toConversations — AI 대화", () => {
  const msgs: ChatMessage[] = [
    { id: "m1", role: "user", text: "생활관은 어떻게 신청해요?" },
    { id: "m2", role: "assistant", text: "가까운 지부에 전화해서 문의하시면 돼요." },
  ];

  it("말이 오간 할 일만 목록에 낸다", () => {
    const list = toConversations([], { R1: msgs, R11: [] }, titleOf);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("R1");
  });

  it("할 일 이름을 제목으로 쓴다", () => {
    const list = toConversations([], { R1: msgs }, titleOf);
    expect(list[0].title).toBe("숙식제공");
  });

  it("모르는 할 일이면 서비스 이름으로 둔다", () => {
    const list = toConversations([], { R99: msgs }, titleOf);
    expect(list[0].title).toBe("마중365와 나눈 이야기");
  });

  it("마지막에 오간 말을 미리 보여준다", () => {
    const list = toConversations([], { R1: msgs }, titleOf);
    expect(list[0].preview).toBe("가까운 지부에 전화해서 문의하시면 돼요.");
  });
});

describe("toConversations — 순서", () => {
  it("최근에 말한 것이 위로 온다", () => {
    const list = toConversations(
      [
        req({ id: "old", status: "acknowledged", createdAt: "2026-08-24T09:00:00+09:00" }),
        req({ id: "new", status: "acknowledged", createdAt: "2026-08-26T09:00:00+09:00" }),
      ],
      {},
      titleOf,
    );
    expect(list.map((c) => c.id)).toEqual(["new", "old"]);
  });

  it("시각을 모르는 AI 대화는 맨 아래로 간다", () => {
    const list = toConversations(
      [req({ id: "v", status: "acknowledged" })],
      { R1: [{ id: "m", role: "user", text: "안녕하세요" }] },
      titleOf,
    );
    expect(list.map((c) => c.kind)).toEqual(["staff", "ai"]);
  });
});
