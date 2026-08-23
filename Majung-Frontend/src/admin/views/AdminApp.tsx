// 담당자 화면 묶음 (§8.3).
//
// **로그인은 서버가 확인한다** (§8.2). 계정은 운영 쪽에서 발급하며 가입 화면이 없다.
// 목록 데이터는 아직 화면 안의 예시다 — 서버 목록 API가 붙으면 그 자리만 바뀐다.
//
// **열람 제한은 서버가 한다.** 다른 기관의 요청은 목록에 아예 오지 않고, id를 알아내
// 수정을 시도해도 거부된다. 화면이 거르는 것이 아니다.
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
