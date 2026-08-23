// 담당자 화면 세션 (§8.3).
//
// ⚠️ **인증이 아니다.** 자격 확인이 브라우저 안에서 끝난다. 실제 인증이 붙으면
// demoCredentials.ts와 함께 이 훅의 검사 부분을 서버 호출로 바꾼다.
//
// 세션을 기기에 저장하지 않는다. 새로고침하면 로그인 화면으로 돌아간다. 담당자 기기가
// 공용일 수 있으므로(§8.2-4) 남겨두지 않는 편이 맞다.
import { useCallback, useEffect, useRef, useState } from "react";

import { IDLE_LOGOUT_MS, matchesDemoCredentials } from "../domain/demoCredentials";

export function useAdminSession() {
  const [signedIn, setSignedIn] = useState(false);
  const [failed, setFailed] = useState(false);
  /** 손을 놓아 스스로 닫혔는지. 로그인 화면에서 이유를 알려준다. */
  const [timedOut, setTimedOut] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signOut = useCallback((byTimeout = false) => {
    setSignedIn(false);
    setTimedOut(byTimeout);
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /** 화면을 만질 때마다 시계를 되돌린다. */
  const touch = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => signOut(true), IDLE_LOGOUT_MS);
  }, [signOut]);

  const signIn = useCallback(
    (id: string, password: string) => {
      if (!matchesDemoCredentials(id, password)) {
        setFailed(true);
        return false;
      }
      setFailed(false);
      setTimedOut(false);
      setSignedIn(true);
      touch();
      return true;
    },
    [touch],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { signedIn, failed, timedOut, signIn, signOut, touch };
}
