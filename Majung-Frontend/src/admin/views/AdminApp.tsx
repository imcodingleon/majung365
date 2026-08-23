// 담당자 화면 묶음 (§8.3).
//
// ⚠️ **시연용이다.** 실제 인증도, 실데이터 연결도 없다. §12-3이 정해지면 이 폴더는
// 별도 앱으로 떼어내고 §8.2의 네 가지 전제 조건(계정 체계·접근 통제·열람 감사 로그·
// 자동 로그아웃)으로 대체한다.
//
// 화면 전환을 라우트가 아니라 상태로 한다. 떼어낼 때 이 폴더만 옮기면 되게 하려는 것이다.
import { useCallback, useState } from "react";
import { View } from "react-native";

import type { VisitStatus } from "@/shared/types/visit";

import { DEMO_REQUESTS } from "../domain/demoRequests";
import type { ConfirmInput, StaffRequest } from "../domain/staffRequest";
import { useAdminSession } from "../hooks/useAdminSession";

import { AdminLoginScreen } from "./AdminLoginScreen";
import { RequestDetailScreen } from "./RequestDetailScreen";
import { RequestListScreen } from "./RequestListScreen";
import { StaffChatScreen, type StaffMessage } from "./StaffChatScreen";

export function AdminApp() {
  const session = useAdminSession();
  const [requests, setRequests] = useState<StaffRequest[]>([...DEMO_REQUESTS]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [threads, setThreads] = useState<Record<string, StaffMessage[]>>({});

  const open = requests.find((r) => r.id === openId) ?? null;

  const patch = useCallback(
    (id: string, next: Partial<StaffRequest> & { status?: VisitStatus }) => {
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)));
    },
    [],
  );

  if (!session.signedIn) {
    return (
      <AdminLoginScreen
        failed={session.failed}
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
        <StaffChatScreen
          peerName={open.name}
          messages={threads[open.id] ?? []}
          onSend={touched<string>((text) => {
            setThreads((prev) => {
              const room = prev[open.id] ?? [];
              return {
                ...prev,
                [open.id]: [...room, { id: `${open.id}-${room.length + 1}`, from: "staff", text }],
              };
            });
          })}
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
          onAcknowledge={touched<void>(() => patch(open.id, { status: "acknowledged" }))}
          onConfirm={touched<ConfirmInput>((input) => {
            // 만날 사람과 장소는 출소자 화면의 확정 문구가 된다 (§7.1).
            // 서버 연결이 붙으면 여기서 그 값을 함께 보낸다.
            patch(open.id, { status: "confirmed" });
            void input;
          })}
          onProposeReschedule={touched<string>(() =>
            patch(open.id, { status: "reschedule_proposed" }),
          )}
          onCancel={touched<string>(() => patch(open.id, { status: "cancelled" }))}
          onOpenChat={touched<void>(() => setChatOpen(true))}
          onBack={touched<void>(() => setOpenId(null))}
        />
      </View>
    );
  }

  return (
    <View className="flex-1" onTouchStart={session.touch}>
      <RequestListScreen
        requests={requests}
        onOpen={touched<string>((id) => setOpenId(id))}
        onSignOut={() => session.signOut()}
      />
    </View>
  );
}
