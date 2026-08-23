// 앱 진입점. 이번에 가입을 마쳤으면 오늘의 할 일로, 아니면 가입 화면으로 보낸다.
//
// 진입 게이트가 없다. 코드 입력 화면(s-code)은 폐지되었다 (§2.3).
//
// **아직 서버가 아무것도 저장하지 않아 앱을 닫으면 처음부터다.** 저장(Supabase)이 붙으면
// 기기 세션으로 자동 로그인한다 (§2.4).
import { Redirect } from "expo-router";

import { getSession } from "@/shared/utils/session";

export default function IndexRoute() {
  return <Redirect href={getSession() ? "/today" : "/signup"} />;
}
