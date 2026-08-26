// 상담 탭에 쌓이는 대화 한 줄.
//
// **두 종류를 한 목록에 섞는다.** 담당자 대화는 방문 요청 단위이고 AI 대화는 할 일
// 단위인데, 사용자에게는 둘 다 "이야기한 곳"이라 나누어 보일 이유가 없다.
//
// 이 파일은 계산만 한다. 화면도 서버 호출도 없다.
import { canOpenStaffChat, type VisitRequest } from "@/features/visit/domain/request";

import type { ChatMessage } from "./chatMessage";

export type Conversation = {
  kind: "staff" | "ai";
  /** 담당자 대화면 방문 요청 id, AI 대화면 할 일 id. */
  id: string;
  title: string;
  /** 마지막으로 오간 말 한 줄. 없으면 빈 문자열이다. */
  preview: string;
  /**
   * 마지막 시각(ISO). 없으면 `null`이며 목록 맨 아래로 간다.
   *
   * AI 대화에는 시각이 없다 — 서버가 대화를 돌려줄 때 시각을 함께 주지 않는다.
   */
  at: string | null;
  unread: number;
};

/** 최근에 말한 것이 위로 온다. 시각이 없는 것은 맨 아래다. */
function byRecent(a: Conversation, b: Conversation): number {
  if (a.at === null && b.at === null) return 0;
  if (a.at === null) return 1;
  if (b.at === null) return -1;
  return b.at.localeCompare(a.at);
}

/** 할 일 하나에 오간 말 중 마지막 것. 화면에 한 줄로 미리 보인다. */
function lastText(messages: readonly ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    // 검색 고지처럼 사람이 한 말이 아닌 줄은 미리보기로 쓰지 않는다.
    if ("text" in m && m.text) return m.text;
  }
  return "";
}

export function toConversations(
  requests: readonly VisitRequest[],
  threads: Readonly<Record<string, readonly ChatMessage[]>>,
  /** 할 일 id를 사람이 읽는 제목으로 바꾼다. 모르는 id면 `undefined`를 돌려준다. */
  titleOf: (taskId: string) => string | undefined,
  /**
   * 서버에 대화가 남아 있는 할 일들. **최근에 말한 것이 앞이다.**
   *
   * 기기의 `threads`는 이번에 연 방만 담는다. 그것만 보면 앱을 다시 켰을 때 상담
   * 탭이 비어, 어제 나눈 이야기가 사라진 것처럼 보인다 — 대화를 저장하기로 한
   * 이유(§6.3)가 그대로 무효가 된다.
   */
  savedRooms: readonly string[] = [],
): Conversation[] {
  const staff: Conversation[] = requests
    // **담당자가 확인하기 전에는 방이 열리지 않는다**(§7.3-4). 목록에도 내지 않는다.
    // 판정은 도메인 함수를 쓴다 — 여기서 상태를 다시 세면 규칙이 두 곳에 생긴다.
    .filter((r) => canOpenStaffChat(r.status))
    .map((r) => ({
      kind: "staff" as const,
      id: r.id,
      title: r.confirmation?.staffName ?? "담당자",
      // **마지막 말을 여기서 보여주지 못한다.** 담당자 대화는 소켓으로 방에 들어가야
      // 내용이 오고, 목록을 그리자고 방마다 붙을 수는 없다. 서버가 나중에 마지막 말을
      // 요청 응답에 실어 주면 그때 채운다.
      preview: "",
      at: r.createdAt ?? null,
      unread: r.unread,
    }));

  // **서버에 남은 방과 이번에 연 방을 합친다.** 서버 목록이 순서를 정하고, 이번에
  // 연 방 중 아직 서버에 안 담긴 것(방금 첫 말을 건 방)을 뒤에 붙인다.
  const openedNow = Object.entries(threads)
    .filter(([, messages]) => messages.length > 0)
    .map(([taskId]) => taskId);
  const rooms = [...savedRooms, ...openedNow.filter((id) => !savedRooms.includes(id))];

  const ai: Conversation[] = rooms.map((taskId) => ({
    kind: "ai" as const,
    id: taskId,
    // 어느 할 일에서 물었는지가 곧 제목이다. 모르는 id면 서비스 이름으로 둔다.
    title: titleOf(taskId) ?? "마중365와 나눈 이야기",
    // 방을 열어야 내용이 온다. 아직 안 연 방은 미리 보여줄 것이 없다.
    preview: lastText(threads[taskId] ?? []),
    at: null,
    unread: 0,
  }));

  return [...staff, ...ai].sort(byRecent);
}
