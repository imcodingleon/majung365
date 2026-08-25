// 사용자가 담당자와 이야기하는 화면 (§7.3).
//
// **이 화면이 없어서 담당자가 보낸 말이 사용자에게 닿지 않았다.** 담당자 쪽만 만들고
// 사용자 쪽 짝을 만들지 않았고, 홈의 "담당자와 이야기하기" 버튼은 AI 채팅을 열고
// 있었다. 담당자는 소켓 방에 답을 쓰고 사용자는 AI에게 말하는 상태였다.
//
// 연결은 `useVisitChat`이 맡는다. **담당자 쪽과 같은 훅, 같은 화면을 쓴다** — 서버가
// 출소자 토큰과 담당자 토큰을 각각 다른 저장소에서 찾아 누구인지 가리므로, 다른 것은
// 넘기는 토큰과 `myRole`뿐이다.
import { useEffect, useState } from "react";

import { FramedModal } from "@/shared/components/FramedModal";
import { loadToken } from "@/shared/utils/tokenStore";

import type { VisitRequest } from "../domain/request";
import { useVisitChat } from "../hooks/useVisitChat";
import { StaffChatScreen } from "./StaffChatScreen";

export function UserChatSheet({
  request,
  onClose,
}: {
  request: VisitRequest;
  onClose: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadToken().then((t) => {
      if (alive) setToken(t);
    });
    return () => {
      alive = false;
    };
  }, []);

  const chat = useVisitChat(request.id, token, "user");
  // **쓰는 값만 꺼내 둔다.** `chat`을 통째로 의존성에 넣으면 렌더마다 새 객체가
  // 되어 읽음 표시가 끝없이 다시 돈다.
  const { connected, blocked, markRead } = chat;

  // 방을 열면 읽음으로 표시한다. 상대는 자기 말이 닿았는지 알아야 기다릴 수 있다.
  useEffect(() => {
    if (connected && !blocked) markRead();
  }, [connected, blocked, markRead]);

  return (
    // **화면 전체를 덮는다** (§6.1). 얹기만 하면 뒤의 할 일 목록이 그대로 보이고
    // 하단 메뉴바가 대화 위에 겹친다. AI 채팅도 같은 이유로 팝업이다.
    //
    // `Modal`을 직접 쓰지 않는다. 웹에서 `Modal`은 앱 프레임 바깥에 그려져,
    // 화면은 모바일 폭인데 팝업만 데스크톱 전체 폭으로 퍼진다.
    <FramedModal visible animationType="slide" onRequestClose={onClose}>
      <StaffChatScreen
        // 확정되기 전에는 만날 사람이 정해지지 않았다. 그때는 직함으로 부른다.
        peerName={request.confirmation?.staffName ?? "담당자"}
        myRole="user"
        eyebrow="담당자와 이야기하기"
        closeHint="할 일 목록으로 돌아가기"
        messages={chat.messages}
        onSend={chat.send}
        onBack={onClose}
        blocked={chat.blocked}
        connected={chat.connected}
      />
    </FramedModal>
  );
}
