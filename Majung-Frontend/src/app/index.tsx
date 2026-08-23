// 앱 진입점. 세션이 있으면 오늘의 할 일로, 없으면 되살려 보고, 그래도 없으면 가입으로.
//
// 진입 게이트가 없다. 코드 입력 화면(s-code)은 폐지되었다 (§2.3).
//
// **되살리기가 여기 있는 이유.** 앱을 닫거나 새로고침하면 진단 답변도 할 일도 사라진다
// (메모리에만 두기 때문이다 — 주소창에도 브라우저에도 남기지 않는다). 그대로 두면
// 가입 화면부터 다시 시작하게 되는데, **27문항을 다시 답하게 하는 것은 이 사용자층에게
// 특히 무거운 요구다.** 토큰이 남아 있으면 서버에서 할 일을 되받아 이어서 연다 (§2.4).
//
// **답변을 다시 보내지 않는다.** 서버에 남은 것은 답변이 아니라 판정이고(§9.1), 할 일은
// 서버가 이미 계산해서 준다.
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect } from "expo-router";

import type { RouteId } from "@/features/tasks/domain/task";
import { COLORS } from "@/shared/theme/colors";
import { getTasks } from "@/shared/utils/api";
import { getSession, startSession } from "@/shared/utils/session";
import { clearToken, loadToken } from "@/shared/utils/tokenStore";

type Phase = "checking" | "ready";

export default function IndexRoute() {
  // 이미 이번에 가입했으면 되살릴 것이 없다. 그 판단을 먼저 해서 깜빡임을 없앤다.
  const [phase, setPhase] = useState<Phase>(() => (getSession() ? "ready" : "checking"));

  useEffect(() => {
    if (phase === "ready") return;
    let alive = true;

    void (async () => {
      const token = await loadToken();
      if (!token) {
        if (alive) setPhase("ready");
        return;
      }
      try {
        const restored = await getTasks(token);
        if (!alive) return;
        startSession({
          // **답변은 없다.** 서버가 저장하지 않으므로 되살린 세션은 목록만 들고 있고,
          // 기기가 할 일을 다시 계산하지 않는다.
          name: restored.name,
          tasks: restored.tasks,
          completed: restored.completed as RouteId[],
        });
      } catch {
        // 토큰이 만료됐거나 이어서 볼 것이 없다. **남은 토큰을 지운다** — 그대로 두면
        // 들어올 때마다 실패하는 요청을 한 번씩 보낸다.
        await clearToken();
      } finally {
        if (alive) setPhase("ready");
      }
    })();

    return () => {
      alive = false;
    };
  }, [phase]);

  if (phase === "checking") {
    return (
      <View className="flex-1 items-center justify-center bg-page">
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text className="mt-4 text-body text-ink-sub">하시던 것을 불러오고 있어요…</Text>
      </View>
    );
  }

  return <Redirect href={getSession() ? "/today" : "/signup"} />;
}
