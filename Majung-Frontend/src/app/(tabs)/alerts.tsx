// 알림 탭 — 담당자에게서 온 소식 (§7.1).
//
// 화면을 조립하는 자리다. 목록은 방문 요청 상태에서 만들고, 누르면 그 요청의 담당자
// 대화가 열린다 — 소식을 보고 곧바로 되물을 수 있어야 한다.
import { useEffect, useState } from "react";
import { Redirect } from "expo-router";

import { toAlerts } from "@/features/alerts/domain/alert";
import { useLastSeen } from "@/features/alerts/hooks/useLastSeen";
import { AlertListScreen } from "@/features/alerts/views/AlertListScreen";
import { canOpenStaffChat } from "@/features/visit/domain/request";
import { useVisitRequests } from "@/features/visit/hooks/useVisitRequests";
import { UserChatSheet } from "@/features/visit/views/UserChatSheet";
import { getSession } from "@/shared/utils/session";

export default function AlertsRoute() {
  const session = getSession();
  const visit = useVisitRequests();
  const { lastSeen, markSeen } = useLastSeen();
  const [openStaff, setOpenStaff] = useState<string | null>(null);

  // **화면을 떠날 때 본 것으로 표시한다.** 들어오자마자 표시하면 방금 온 소식이
  // 눈에 띄기도 전에 점이 사라진다.
  useEffect(() => markSeen, [markSeen]);

  if (!session) return <Redirect href="/signup" />;

  const alerts = toAlerts(visit.requests);
  const request = openStaff ? (visit.requests.find((r) => r.id === openStaff) ?? null) : null;

  return (
    <>
      <AlertListScreen
        alerts={alerts}
        lastSeen={lastSeen}
        onOpen={(a) => {
          // **취소된 요청은 방이 닫혀 있다**(§7.3-4). 눌러도 거절 문구만 나오므로
          // 열지 않는다 — 소식만 읽고 끝나는 것이 맞다.
          const target = visit.requests.find((r) => r.id === a.visitId);
          if (target && canOpenStaffChat(target.status)) setOpenStaff(a.visitId);
        }}
      />
      {request ? (
        <UserChatSheet
          request={request}
          onClose={() => setOpenStaff(null)}
          closeHint="알림 목록으로 돌아가기"
        />
      ) : null}
    </>
  );
}
