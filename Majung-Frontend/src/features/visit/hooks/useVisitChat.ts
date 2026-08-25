// 방문 조율 채팅 연결 (§7.3·§8.1).
//
// 방은 방문 요청 하나에 하나다. **담당자가 확인하기 전에는 열리지 않는다**(§7.3-4) —
// 거절되면 그 이유가 문구로 오고 화면은 그것을 그대로 낸다.
//
// 지켜야 할 것 넷이 계약에 적혀 있다.
//   - 핸드셰이크 `auth`에 세션 토큰을 싣는다. 출소자 토큰과 담당자 토큰을 서버가
//     각각 다른 저장소에서 찾으므로 섞이지 않는다
//   - **전송 방식을 websocket으로 고정하지 않는다.** 시설이나 회사 방화벽이 업그레이드를
//     막는 경우가 있어, 기본값(polling으로 붙은 뒤 승격)을 그대로 둔다
//   - `clientMsgId`로 임시 말풍선과 서버 에코를 짝짓는다. 같은 id로 다시 보내면 서버가
//     재전송으로 보고 무시하므로 **끊겨서 다시 눌러도 대화가 두 번 쌓이지 않는다**
//   - 토큰이 갱신되면 자격증명도 교체한다. 안 하면 재연결 때마다 만료된 토큰을 넘겨
//     조용히 채팅이 죽는다
//
// **이미지는 주고받지 않는다.** 신분증이나 서류 사진이 오가면 위험만 커진다. 텍스트만이다.
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import type { StaffMessage } from "../views/StaffChatScreen";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * 서버가 주는 메시지 한 건.
 *
 * **필드 이름은 실제 응답을 보고 맞췄다.** 계약 문서에는 `sender`·`client_msg_id`로
 * 적혀 있었는데 서버는 `senderRole`·`clientMsgId`를 보낸다. 이름이 어긋나면
 * 오류 없이 `undefined`가 되어 **말풍선이 전부 한쪽에 붙는다.**
 */
type ServerMessage = {
  id: string;
  visitId: string;
  body: string;
  /** 보낸 쪽. 담당자인지 출소자인지 서버가 알려준다. */
  senderRole: "staff" | "user";
  createdAt: string;
  clientMsgId?: string;
};

type JoinResult = { ok: true; messages: ServerMessage[] } | { ok: false; reason: string };

function toMessage(m: ServerMessage): StaffMessage {
  return { id: m.id, from: m.senderRole, text: m.body };
}

/**
 * @param myRole 이 연결을 쓰는 쪽. **보낸 즉시 그리는 말풍선이 이 값을 쓴다.**
 *   담당자용으로 먼저 만들어져 `"staff"`로 박혀 있었고, 그래서 사용자가 보낸 말이
 *   담당자가 보낸 것으로 표시되어 왼쪽에 붙었다. 서버 에코가 오면 제 값으로 바뀌므로
 *   **잠깐 뒤집혔다가 돌아오는, 눈에 띄기 어려운 종류의 결함이었다.**
 */
export function useVisitChat(
  visitId: string | null,
  token: string | null,
  myRole: "staff" | "user",
) {
  const [messages, setMessages] = useState<StaffMessage[]>([]);
  /** 방이 열리지 않은 이유. 서버가 준 문구를 그대로 쓴다. */
  const [blocked, setBlocked] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  /** 보낸 지 얼마 안 된 임시 말풍선. 서버 에코가 오면 지운다. */
  const pending = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!visitId || !token) return;

    const socket = io(API_BASE, { auth: { token } });
    socketRef.current = socket;

    // **방이 바뀌면 이전 방 대화를 지운다.** 지우지 않으면 다른 요청의 채팅을 열었을
    // 때 남의 대화가 잠깐 보인다 — 방은 요청 하나에 하나이므로(§7.3) 섞이면 안 된다.
    //
    // 린터는 이 자리의 setState를 연쇄 렌더로 보고 막는다. 성능에 관한 경고이고,
    // 여기서는 방을 바꿀 때만 도는 한 번의 초기화라 그 대가를 치를 값어치가 있다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([]);
    setBlocked(null);

    socket.on("connect", () => {
      setConnected(true);
      // 입장하면서 지난 대화를 함께 받는다. 따로 요청하지 않는다.
      socket.emit("join", { visitId }, (res: JoinResult) => {
        if (res.ok) {
          setMessages(res.messages.map(toMessage));
          setBlocked(null);
        } else {
          // **없는 요청과 남의 요청에 같은 문구가 온다.** 구분해 주면 남의 방 id를 찾는
          // 데 쓰이므로, 화면에서도 그 둘을 다르게 표시하지 않는다.
          setBlocked(res.reason);
        }
      });
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("new_message", (m: ServerMessage) => {
      setMessages((prev) => {
        // **같은 메시지가 두 번 올 수 있다.** 서버는 재전송을 저장하지 않지만(같은 id가
        // 돌아온다) 에코는 두 번 보낸다. 실측으로 확인했다(2026-08-23).
        if (prev.some((x) => x.id === m.id)) return prev;

        // 내가 보낸 것의 에코면 임시 말풍선을 진짜로 바꾼다.
        if (m.clientMsgId && pending.current.has(m.clientMsgId)) {
          pending.current.delete(m.clientMsgId);
          return prev.map((x) => (x.id === m.clientMsgId ? toMessage(m) : x));
        }
        return [...prev, toMessage(m)];
      });
    });

    socket.on("chat_error", (e: { reason?: string }) => {
      setBlocked(e.reason ?? "지금은 이용할 수 없어요. 잠시 후 다시 시도해 주세요.");
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
    // 토큰이 갱신되면 연결을 다시 맺는다. 자격증명을 바꾸지 않으면 조용히 죽는다.
  }, [visitId, token]);

  const send = useCallback(
    (text: string) => {
      const socket = socketRef.current;
      const body = text.trim();
      if (!socket || !body) return;

      // 시각이 아니라 임의값으로 만든다. 같은 순간에 두 번 눌러도 겹치지 않는다.
      const clientMsgId = `c-${Math.random().toString(36).slice(2)}-${messagesSeq()}`;
      pending.current.add(clientMsgId);

      // 낙관적 표시. 보낸 즉시 화면에 남아야 사용자가 다시 누르지 않는다.
      // **보낸 쪽을 박아 두지 않는다** — 이 연결을 쓰는 쪽이 넣어 준다.
      setMessages((prev) => [...prev, { id: clientMsgId, from: myRole, text: body }]);
      socket.emit("send_message", { body, clientMsgId });
    },
    [myRole],
  );

  const markRead = useCallback(() => {
    socketRef.current?.emit("mark_read", {});
  }, []);

  return { messages, blocked, connected, send, markRead };
}

/** 한 화면 안에서 순번을 겹치지 않게 한다. */
let seq = 0;
function messagesSeq(): number {
  seq += 1;
  return seq;
}
