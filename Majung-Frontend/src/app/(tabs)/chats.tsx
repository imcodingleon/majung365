// 상담 탭 — 나눈 이야기 (§6·§7.3).
//
// 화면을 조립하는 자리다. 목록은 `ChatListScreen`이 그리고, 어느 대화를 열지는
// 여기서 정한다.
//
// **AI 대화는 여기서 열지 않고 홈으로 보낸다.** 그 화면은 할 일 카드의 문맥(근거
// 배지·담당 기관 연락처)을 함께 받아 그리는데, 여기서 같은 조립을 다시 하면 **같은
// 화면을 만드는 규칙이 두 곳에 생긴다.**
import { useState } from "react";
import { Redirect, router } from "expo-router";

import { toConversations, type Conversation } from "@/features/chat/domain/conversation";
import { useTaskThreads } from "@/features/chat/hooks/useTaskThreads";
import { ChatListScreen } from "@/features/chat/views/ChatListScreen";
import { toTasks } from "@/features/tasks/domain/fromServer";
import { useVisitRequests } from "@/features/visit/hooks/useVisitRequests";
import { UserChatSheet } from "@/features/visit/views/UserChatSheet";
import { getSession } from "@/shared/utils/session";

export default function ChatsRoute() {
  const session = getSession();
  const visit = useVisitRequests();
  const ai = useTaskThreads();
  /** 담당자 채팅을 연 방문 요청 id. 방은 요청 하나에 하나다 (§7.3). */
  const [openStaff, setOpenStaff] = useState<string | null>(null);

  if (!session) return <Redirect href="/signup" />;

  // **세션에 있는 것을 쓴다.** 할 일 제목만 필요한데 서버를 다시 부르면 화면을 열
  // 때마다 요청이 하나 더 나간다. 세션의 목록은 처음 받은 전체라 마친 할 일의
  // 제목도 들어 있다 — 마쳤다고 그때 나눈 이야기가 사라지지는 않는다.
  const titles = new Map(
    (session.tasks ? toTasks(session.tasks) : []).map((t) => [t.id as string, t.title]),
  );

  const conversations = toConversations(visit.requests, ai.threads, (id) => titles.get(id));

  const open = (c: Conversation) => {
    if (c.kind === "staff") {
      setOpenStaff(c.id);
    } else {
      // 할 일 카드의 문맥이 있어야 제대로 그려진다. 홈으로 보내고 거기서 연다.
      router.push({ pathname: "/today", params: { openChat: c.id } });
    }
  };

  const request = openStaff ? (visit.requests.find((r) => r.id === openStaff) ?? null) : null;

  return (
    <>
      <ChatListScreen conversations={conversations} onOpen={open} />
      {request ? (
        <UserChatSheet
          request={request}
          onClose={() => {
            setOpenStaff(null);
            // **닫을 때 다시 읽는다.** 대화를 열면 서버가 읽음으로 표시하는데,
            // 화면이 그것을 모르면 안 읽은 수가 그대로 남는다.
            void visit.reload();
          }}
          closeHint="나눈 이야기 목록으로 돌아가기"
        />
      ) : null}
    </>
  );
}
