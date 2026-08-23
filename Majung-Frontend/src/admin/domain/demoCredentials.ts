// ⚠️ **시연용 임시 계정. 인증이 아니다.** (§8.3)
//
// 담당자 계정 발급 절차가 정해지지 않아(§12-3) 화면 흐름을 먼저 만들기 위한 값이다.
// **이 검사는 브라우저 안에서 끝나므로 번들을 열면 값이 보인다. 막을 수 있는 것이 없다.**
//
// 실제 인증이 붙을 때 **이 파일을 통째로 지운다.** 다른 곳에 같은 값을 복사해 두지 않았다.
//
// 이것을 인증으로 오해한 채 배포하면 출소자 명단이 아이디 하나로 열린다.
// 그래서 관리자 화면은 실데이터에 닿지 않는다. 목업 데이터만 읽는다.

const DEMO_ID = "admin";
const DEMO_PASSWORD = "admin1234";

/** 시연용 자격 확인. 서버에 묻지 않으므로 인증이라고 부르지 않는다. */
export function matchesDemoCredentials(id: string, password: string): boolean {
  return id.trim() === DEMO_ID && password === DEMO_PASSWORD;
}

/** 담당자 기기가 공용일 수 있다. 손을 놓으면 스스로 닫힌다 (§8.2-4). */
export const IDLE_LOGOUT_MS = 5 * 60 * 1000;
