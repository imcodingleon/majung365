// 알림을 마지막으로 본 시각. **기기에만 둔다** (`decision-log-2026-08-26.md` A-3).
import { useCallback, useState } from "react";

import { lastAlertsSeen, markAlertsSeen } from "@/shared/utils/storage";

export function useLastSeen() {
  // 처음 값은 렌더 전에 한 번만 읽는다. effect로 읽으면 첫 그림에서 모든 알림이
  // 안 읽은 것으로 보였다가 곧 바뀐다.
  const [lastSeen, setLastSeen] = useState<string | null>(() => lastAlertsSeen());

  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    setLastSeen(now);
    markAlertsSeen(now);
  }, []);

  return { lastSeen, markSeen };
}
