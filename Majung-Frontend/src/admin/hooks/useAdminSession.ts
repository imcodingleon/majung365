// 담당자 로그인 (§8.2·§8.3).
//
// **서버가 확인한다.** 예전에는 자격 검사가 브라우저 안에서 끝나 번들을 열면 비밀번호가
// 보였다. 그 값이 실제 계정의 것이기까지 해서, 화면을 숨기는 것만으로는 막을 수 없었다.
//
// **토큰을 기기에 저장하지 않는다.** 서버가 8시간까지 받아주는 것과 앱이 그동안 붙들고
// 있는 것은 다른 문제다. 담당자 기기는 공용일 수 있어 새로고침하면 다시 로그인한다.
// 로그인 한 번의 부담보다 공용 기기에 세션이 남는 위험이 크다 (§8.2).
//
// 손을 놓으면 스스로 닫히는 것도 같은 이유다. 서버 만료(8시간)보다 훨씬 짧다.
import { useCallback, useEffect, useRef, useState } from "react";

import type { StaffLoginResponse } from "@/shared/types";
import { ApiError, postStaffLogin, postStaffLogout } from "@/shared/utils/api";

/** 담당자 기기가 공용일 수 있다. 손을 놓으면 스스로 닫힌다 (§8.2-4). */
export const IDLE_LOGOUT_MS = 5 * 60 * 1000;

/** 로그인한 담당자. 토큰까지 여기 있고 메모리 밖으로 나가지 않는다. */
export type AdminSession = StaffLoginResponse;

const DEFAULT_FAIL = "아이디나 비밀번호가 맞지 않아요.";

export function useAdminSession() {
  const [session, setSession] = useState<AdminSession | null>(null);
  /** 실패 문구. 없으면 null. 서버가 준 말을 그대로 보여준다. */
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 손을 놓아 스스로 닫혔는지. 로그인 화면에서 이유를 알려준다. */
  const [timedOut, setTimedOut] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 로그아웃 요청에 쓸 토큰. 상태를 비운 뒤에도 보내야 해서 따로 든다. */
  const token = useRef<string | null>(null);

  const signOut = useCallback((byTimeout = false) => {
    const t = token.current;
    token.current = null;
    setSession(null);
    setTimedOut(byTimeout);
    if (timer.current) clearTimeout(timer.current);
    // 서버 세션도 지운다. 실패해도 화면은 이미 나갔다 — 나가는 길이 막히면 안 된다.
    if (t) void postStaffLogout(t);
  }, []);

  /** 화면을 만질 때마다 시계를 되돌린다. */
  const touch = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => signOut(true), IDLE_LOGOUT_MS);
  }, [signOut]);

  const signIn = useCallback(
    async (loginId: string, password: string): Promise<boolean> => {
      if (busy) return false;
      setBusy(true);
      setError(null);
      try {
        const found = await postStaffLogin({ login_id: loginId.trim(), password });
        token.current = found.session_token;
        setSession(found);
        setTimedOut(false);
        touch();
        return true;
      } catch (err) {
        // 서버는 아이디가 틀렸는지 비밀번호가 틀렸는지 구분해 알리지 않는다.
        // 구분하면 존재하는 아이디를 찾아내는 길이 되기 때문이며, 화면도 그 문구를 그대로 낸다.
        setError(err instanceof ApiError ? err.message : DEFAULT_FAIL);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, touch],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return {
    session,
    signedIn: session !== null,
    error,
    busy,
    timedOut,
    signIn,
    signOut,
    touch,
  };
}
