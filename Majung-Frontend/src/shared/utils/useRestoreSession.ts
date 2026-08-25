// 앱을 다시 켜거나 새로고침했을 때 하던 곳으로 돌아온다 (§5.2 · §2.4).
//
// **어느 화면으로 들어오든 여기를 지난다.** 처음에는 진입점(`index.tsx`)에만 두었는데,
// 웹에서 `/today`를 열어 둔 채 새로고침하면 그 화면이 바로 뜨면서 진입점을 거치지
// 않는다. 세션이 없으니 곧장 가입 화면으로 보내졌고, **복원은 시도조차 되지 않았다.**
// 그래서 루트 레이아웃이 부른다.
//
// **답변을 다시 보내지 않는다.** 서버에 남은 것은 답변이 아니라 판정이고(§9.1), 할 일은
// 서버가 이미 계산해서 준다.
import { useEffect, useState } from "react";

import type { RouteId } from "@/shared/types/route";
import { ApiError, getTasks } from "@/shared/utils/api";
import { getSession, startSession } from "@/shared/utils/session";
import { clearToken, loadToken } from "@/shared/utils/tokenStore";

/** 되살리는 중인가. 그동안 화면을 가입 쪽으로 보내면 안 된다. */
export function useRestoreSession(): { checking: boolean } {
  // 이번에 이미 가입했으면 되살릴 것이 없다. 그 판단을 먼저 해서 깜빡임을 없앤다.
  const [checking, setChecking] = useState(() => getSession() === null);

  useEffect(() => {
    if (!checking) return;
    let alive = true;

    void (async () => {
      const token = await loadToken();
      if (!token) {
        if (alive) setChecking(false);
        return;
      }
      try {
        const restored = await getTasks(token);
        if (!alive) return;
        startSession({
          name: restored.name,
          tasks: restored.tasks,
          completed: restored.completed as RouteId[],
        });
      } catch (err) {
        // **아무 실패에나 토큰을 지우지 않는다.** 서버가 잠깐 안 되거나 인터넷이
        // 끊긴 것뿐인데 지워 버리면, 그 뒤로는 영영 가입부터 하게 된다.
        //
        // 지우는 것은 **토큰이 더는 통하지 않을 때**뿐이다.
        //   401  세션이 만료됐거나 계정이 지워졌다
        //   404  이어서 볼 것이 없다 (저장이 꺼져 있던 때 가입한 경우)
        const status = err instanceof ApiError ? err.status : 0;
        if (status === 401 || status === 404) await clearToken();
      } finally {
        if (alive) setChecking(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [checking]);

  return { checking };
}
