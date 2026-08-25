// 앱 진입점. 가입을 마쳤으면 오늘의 할 일로, 아니면 가입 화면으로 보낸다.
//
// 진입 게이트가 없다. 코드 입력 화면(s-code)은 폐지되었다 (§2.3).
//
// **세션 되살리기는 여기 없다.** 루트 레이아웃이 맡는다 — 웹에서 `/today`를 열어 둔 채
// 새로고침하면 이 화면을 거치지 않기 때문이다(§5.2 · `useRestoreSession`). 그래서
// 여기 도착했을 때는 되살리기가 이미 끝나 있다.
import { Redirect } from "expo-router";

import { getSession } from "@/shared/utils/session";

export default function IndexRoute() {
  return <Redirect href={getSession() ? "/today" : "/signup"} />;
}
