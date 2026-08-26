// 담당자 화면 묶음 (§8.3).
//
// **로그인은 서버가 확인한다** (§8.2). 계정은 운영 쪽에서 발급하며 가입 화면이 없다.
//
// **열람 제한은 서버가 한다.** 다른 기관의 요청은 목록에 아예 오지 않고, id를 알아내
// 수정을 시도해도 거부된다. 화면이 거르는 것이 아니다.
//
// 화면 전환을 라우트가 아니라 상태로 한다. 떼어낼 때 이 폴더만 옮기면 되게 하려는 것이다.
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import type { VisitStatus } from "@/shared/types/visit";

import type { ConfirmInput, StaffRequest } from "../domain/staffRequest";
import { useAdminSession } from "../hooks/useAdminSession";
import { useStaffVisits } from "../hooks/useStaffVisits";
import { useVisitChat } from "@/features/visit/hooks/useVisitChat";

import { AdminLoginScreen } from "./AdminLoginScreen";
import { RequestDetailScreen } from "./RequestDetailScreen";
import { RequestListScreen } from "./RequestListScreen";
import { StaffChatScreen } from "@/features/visit/views/StaffChatScreen";

/**
 * 방문 조율 채팅방.
 *
 * **훅을 조건부로 부르지 않으려고 컴포넌트를 나눴다.** 채팅이 닫혀 있을 때 소켓을
 * 붙들고 있으면 담당자가 목록만 보는 동안에도 연결이 살아 있게 된다.
 */
function StaffChatRoom({
  request,
  token,
  onTouch,
  onBack,
}: {
  request: StaffRequest;
  token: string | null;
  onTouch: () => void;
  onBack: () => void;
}) {
  const chat = useVisitChat(request.id, token, "staff");

  // 방을 열면 읽음으로 표시한다. 상대는 자기 말이 닿았는지 알아야 기다릴 수 있다.
  useEffect(() => {
    if (chat.connected && !chat.blocked) chat.markRead();
  }, [chat.connected, chat.blocked, chat.markRead]);

  return (
    <StaffChatScreen
      peerName={request.name}
      myRole="staff"
      messages={chat.messages}
      blocked={chat.blocked}
      connected={chat.connected}
      onSend={(text) => {
        onTouch();
        chat.send(text);
      }}
      onBack={onBack}
    />
  );
}

export function AdminApp() {
  const session = useAdminSession();
  const token = session.session?.session_token ?? null;
  const visits = useStaffVisits(token);
  const [openId, setOpenId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const open = visits.requests.find((r) => r.id === openId) ?? null;

  if (!session.signedIn) {
    return (
      <AdminLoginScreen
        error={session.error}
        busy={session.busy}
        timedOut={session.timedOut}
        onSignIn={session.signIn}
      />
    );
  }

  // 화면을 만질 때마다 자동 로그아웃 시계를 되돌린다 (§8.2-4).
  const touched = <T,>(fn: (arg: T) => void) => (arg: T) => {
    session.touch();
    fn(arg);
  };

  if (open && chatOpen) {
    return (
      <View className="flex-1" onTouchStart={session.touch}>
        <StaffChatRoom
          request={open}
          token={session.session?.session_token ?? null}
          onTouch={session.touch}
          onBack={touched<void>(() => setChatOpen(false))}
        />
      </View>
    );
  }

  if (open) {
    return (
      <View className="flex-1" onTouchStart={session.touch}>
        <RequestDetailScreen
          request={open}
          onAcknowledge={touched<void>(() => void visits.act(open.id, "acknowledged"))}
          onConfirm={touched<ConfirmInput>((input) => {
            // **장소만 보낸다. 담당자 이름은 서버가 채운다.**
            //
            // 합쳐 보내면 담당자가 교체될 때 옛 이름이 장소 문자열에 박혀 남는다.
            // 서버는 요청을 처리한 담당자 id를 기록하고, 출소자 화면에는 `staff_name`과
            // `meeting_place`가 따로 내려간다 — §7.1이 요구하는 "만날 사람과 만날 장소"다.
            //
            // 장소 없이 확정하면 서버가 거부한다. 그것이 이 기능의 핵심이기 때문이다.
            void visits.act(open.id, "confirmed", {
              meeting_place: input.place,
              // **만나기로 한 때를 함께 보낸다** (2026-08-26 결정). 안 보내면 서버가
              // 출소자 희망 시각으로 채우므로, 담당자가 화면에서 때를 바꿔도 출소자에게는
              // 원래 적어낸 때가 그대로 간다. 담당자가 고친 것이 조용히 사라진다.
              confirmed_for: input.whenIso,
            });
          })}
          // **제안한 시각을 함께 보낸다.** 담당자가 적은 시각을 버리고 상태만 바꾸면,
          // 출소자 화면에 "담당자가 다른 시간을 이야기했어요"만 뜨고 **언제인지가 빠진다.**
          onCancel={touched<string>((reason) =>
            void visits.act(open.id, "cancelled", { cancel_reason: reason }),
          )}
          onOpenChat={touched<void>(() => setChatOpen(true))}
          onBack={touched<void>(() => setOpenId(null))}
        />
      </View>
    );
  }

  return (
    <View className="flex-1" onTouchStart={session.touch}>
      <RequestListScreen
        requests={visits.requests}
        loading={visits.loading}
        error={visits.error}
        staff={
          session.session
            ? {
                displayName: session.session.display_name,
                orgKind: session.session.org_kind,
                branch: session.session.branch,
              }
            : null
        }
        onOpen={touched<string>((id) => setOpenId(id))}
        onSignOut={() => session.signOut()}
      />
    </View>
  );
}
