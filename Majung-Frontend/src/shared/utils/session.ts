// 이번에 앱을 켜 있는 동안만 들고 있는 값.
//
// **아무 데도 저장하지 않는다.** 메모리에만 있으므로 앱을 닫으면 사라진다.
//
// 왜 이렇게 하나
//   - **URL 파라미터로 넘길 수 없다.** 초기 진단 답변에는 사는 곳·건강·빚 같은 사정이
//     들어 있고, 그것이 주소창에 남으면 안 된다
//   - **localStorage에 둘 수도 없다.** 평문으로 남으면 기기를 잡은 사람이 읽는다 (§2.4)
//
// 서버 저장(Supabase)이 붙으면 이 모듈은 세션 토큰으로 대체된다. 지금은 서버가 아무것도
// 들고 있지 않아 가입 화면에서 홈으로 답을 넘기는 통로가 필요할 뿐이다.
import type { IntakeAnswerMap } from "../types";

type Session = {
  answers: IntakeAnswerMap;
  /** 인사말에 쓸 이름. */
  name: string;
};

let current: Session | null = null;

export function startSession(session: Session): void {
  current = session;
}

export function getSession(): Session | null {
  return current;
}

/** 모든 정보를 지웠을 때. 다음 화면은 가입부터 시작한다 (§9.4). */
export function endSession(): void {
  current = null;
}
