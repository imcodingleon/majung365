// 앱 진입점. 가입을 마쳤으면 오늘의 할 일로, 아니면 가입 화면으로 보낸다.
//
// 진입 게이트가 없다. 코드 입력 화면(s-code)은 폐지되었다 (§2.3).
import { Redirect } from "expo-router";

import { isSignedUp } from "@/shared/utils/storage";

export default function IndexRoute() {
  return <Redirect href={isSignedUp() ? "/today" : "/signup"} />;
}
