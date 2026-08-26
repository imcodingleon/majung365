// **전역이 아니라 가져와서 쓴다.** `expo/tsconfig.base`가 `types`를 좁혀 두어
// `describe`·`it`·`expect`가 전역으로 잡히지 않는다. 여기서 가져오면 앱 쪽 설정을
// 건드리지 않고도 타입이 맞는다.
import { describe, expect, it } from "@jest/globals";

import type { VisitRequest, VisitStatus } from "@/features/visit/domain/request";

import type { ChatMessage } from "./chatMessage";
import { groupByPeer, toConversations } from "./conversation";

function req(over: Partial<VisitRequest> & { status: VisitStatus }): VisitRequest {
  return {
    id: "v1",
    taskId: "R1",
    wantedAt: "2026-08-28T14:00:00+09:00",
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

describe("toConversations — 서버에 남은 방", () => {
  const msgs: ChatMessage[] = [{ id: "m", role: "user", text: "안녕하세요" }];

  /** 서버가 아는 방 한 칸. 시각은 최근일수록 뒤 날짜다. */
  const room = (taskId: string, at: string, preview = "") => ({ taskId, preview, at });

  it("이번에 열지 않은 방도 목록에 낸다", () => {
    // **앱을 다시 켜면 기기에는 아무 방도 없다.** 서버 목록이 없으면 상담 탭이
    // 통째로 비어, 어제 나눈 이야기가 사라진 것처럼 보인다 (§6.3).
    const list = toConversations([], {}, titleOf, [
      room("R1", "2026-08-26T10:00:00+09:00"),
      room("R11", "2026-08-25T10:00:00+09:00"),
    ]);
    expect(list.map((c) => c.id)).toEqual(["R1", "R11"]);
  });

  it("서버가 정한 순서를 지킨다", () => {
    // 최근에 말한 방이 앞이다. 그 순서를 화면이 다시 매기지 않는다.
    const list = toConversations([], {}, titleOf, [
      room("R11", "2026-08-26T10:00:00+09:00"),
      room("R1", "2026-08-25T10:00:00+09:00"),
    ]);
    expect(list.map((c) => c.id)).toEqual(["R11", "R1"]);
  });

  it("방금 첫 말을 건 방은 뒤에 붙인다", () => {
    // 서버 목록을 받은 뒤에 연 방은 아직 그 목록에 없다.
    const list = toConversations([], { R11: msgs }, titleOf, [
      room("R1", "2026-08-26T10:00:00+09:00"),
    ]);
    expect(list.map((c) => c.id)).toEqual(["R1", "R11"]);
  });

  it("같은 방이 두 번 나오지 않는다", () => {
    const list = toConversations([], { R1: msgs }, titleOf, [
      room("R1", "2026-08-26T10:00:00+09:00"),
    ]);
    expect(list).toHaveLength(1);
  });

  it("안 연 방도 서버가 준 마지막 말을 보여준다", () => {
    // **이것이 없으면 목록이 제목만 늘어선 표가 된다.** 어제 어디까지 이야기했는지
    // 열어보기 전에는 알 수 없다.
    const list = toConversations([], {}, titleOf, [
      room("R1", "2026-08-26T10:00:00+09:00", "가까운 지부에 전화해 보세요."),
    ]);
    expect(list[0].preview).toBe("가까운 지부에 전화해 보세요.");
  });

  it("방에서 방금 오간 말이 서버가 아는 것보다 앞선다", () => {
    // 방금 보낸 말이 목록에 아직 안 뜨는 일을 막는다. 서버가 알기 전이다.
    const list = toConversations([], { R1: msgs }, titleOf, [
      room("R1", "2026-08-26T10:00:00+09:00", "지난번에 드린 말씀이에요."),
    ]);
    expect(list[0].preview).toBe("안녕하세요");
  });
});

describe("groupByPeer — 누구와 나눈 이야기인지", () => {
  const msgs: ChatMessage[] = [{ id: "m", role: "user", text: "안녕하세요" }];

  it("담당자 묶음이 먼저 온다", () => {
    // **사람이 기다리고 있는 쪽이다.** 답을 늦게 보면 손해가 크다.
    const list = toConversations([req({ status: "acknowledged" })], { R1: msgs }, titleOf);
    expect(groupByPeer(list).map((g) => g.title)).toEqual([
      "담당자와 나눈 이야기",
      "마중365에게 물어본 것",
    ]);
  });

  it("비어 있는 묶음은 내지 않는다", () => {
    // 제목만 있고 아래가 빈 자리는 "불러오지 못했나"로 읽힌다.
    const list = toConversations([], { R1: msgs }, titleOf);
    const groups = groupByPeer(list);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("마중365에게 물어본 것");
  });

  it("아무것도 없으면 묶음도 없다", () => {
    expect(groupByPeer([])).toEqual([]);
  });

  it("묶어도 대화가 사라지지 않는다", () => {
    const list = toConversations([req({ status: "acknowledged" })], { R1: msgs }, titleOf);
    const inGroups = groupByPeer(list).flatMap((g) => g.items);
    expect(inGroups).toHaveLength(list.length);
  });
});
