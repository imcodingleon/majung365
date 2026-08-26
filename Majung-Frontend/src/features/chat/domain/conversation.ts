// 상담 탭에 쌓이는 대화 한 줄.
//
// **두 종류를 한 목록에 섞는다.** 담당자 대화는 방문 요청 단위이고 AI 대화는 할 일
// 단위인데, 사용자에게는 둘 다 "이야기한 곳"이라 나누어 보일 이유가 없다.
//
// 이 파일은 계산만 한다. 화면도 서버 호출도 없다.
import { canOpenStaffChat, type VisitRequest } from "@/features/visit/domain/request";

import type { ChatMessage } from "./chatMessage";

/** 서버가 아는 방 한 칸. 목록을 그리는 데 필요한 것만 담는다. */
export type SavedRoom = {
  taskId: string;
  /** 마지막으로 오간 말. 못 읽었으면 빈 문자열이다. */
  preview: string;
  /** 마지막으로 말한 때(ISO). */
  at: string;
};

export type Conversation = {
  kind: "staff" | "ai";
  /** 담당자 대화면 방문 요청 id, AI 대화면 할 일 id. */
  id: string;
  title: string;
  /** 마지막으로 오간 말 한 줄. 없으면 빈 문자열이다. */
  preview: string;
  /** 마지막 시각(ISO). 없으면 `null`이며 목록 맨 아래로 간다. */
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
  savedRooms: readonly SavedRoom[] = [],
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
      // **마지막 말을 서버가 실어 보낸다.** 대화는 소켓으로 방에 들어가야 오는데,
      // 목록을 그리자고 방마다 붙을 수는 없다. 안 읽은 수와 같은 길로 온다.
      preview: r.lastMessage,
      // 말이 오간 적이 있으면 그때가, 없으면 요청을 보낸 때가 기준이다.
      at: r.lastMessageAt ?? r.createdAt ?? null,
      unread: r.unread,
    }));

  // **서버에 남은 방과 이번에 연 방을 합친다.** 서버가 마지막 말과 시각을 주고,
  // 이번에 연 방 중 아직 서버에 안 담긴 것(방금 첫 말을 건 방)을 뒤에 붙인다.
  const known = new Set(savedRooms.map((r) => r.taskId));
  const openedNow: SavedRoom[] = Object.entries(threads)
    .filter(([taskId, messages]) => messages.length > 0 && !known.has(taskId))
    // 방금 연 방이라 서버가 아직 모른다. 시각은 화면이 지어내지 않는다.
    .map(([taskId]) => ({ taskId, preview: "", at: "" }));

  const ai: Conversation[] = [...savedRooms, ...openedNow].map((room) => ({
    kind: "ai" as const,
    id: room.taskId,
    // 어느 할 일에서 물었는지가 곧 제목이다. 모르는 id면 서비스 이름으로 둔다.
    title: titleOf(room.taskId) ?? "마중365와 나눈 이야기",
    // **기기가 아는 것을 먼저 쓴다.** 지금 방에서 주고받은 말이 서버가 아는 마지막
    // 말보다 새롭다 — 방금 보낸 말이 목록에는 아직 안 뜨는 일을 막는다.
    preview: lastText(threads[room.taskId] ?? []) || room.preview,
    at: room.at || null,
    unread: 0,
  }));

  return [...staff, ...ai].sort(byRecent);
}

export type ConversationGroup = {
  title: string;
  items: readonly Conversation[];
};

/**
 * 누구와 나눈 이야기인지로 묶는다 (2026-08-26 결정 H-3).
 *
 * **아이콘만으로는 안 갈렸다.** 사람 아이콘과 로봇 아이콘을 붙여 두었지만 한 목록에
 * 섞여 있어서, 지금 보는 줄이 담당자인지 마중365인지 제목을 읽어야 알 수 있었다.
 *
 * 위에 탭 둘을 두는 대신 제목 줄로 나눈다 — 탭이면 누르기 전까지 반대쪽에 새 말이
 * 왔는지 보이지 않는다.
 *
 * 비어 있는 묶음은 내지 않는다. 제목만 있고 아래가 빈 자리는 "불러오지 못했나"로 읽힌다.
 */
export function groupByPeer(conversations: readonly Conversation[]): ConversationGroup[] {
  const staff = conversations.filter((c) => c.kind === "staff");
  const ai = conversations.filter((c) => c.kind === "ai");
  const groups: ConversationGroup[] = [];
  // **담당자가 먼저다.** 사람이 기다리고 있는 쪽이고, 답을 늦게 보면 손해가 크다.
  if (staff.length > 0) groups.push({ title: "담당자와 나눈 이야기", items: staff });
  if (ai.length > 0) groups.push({ title: "마중365에게 물어본 것", items: ai });
  return groups;
}
