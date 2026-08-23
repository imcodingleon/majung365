// 담당자 화면 (§8.3).
//
// ⚠️ **시연용이다.** 실제 인증이 아니고 실데이터도 연결되어 있지 않다.
// §8은 별도 앱으로 확정했으나 지금은 같은 코드베이스의 별도 경로에 둔다. 코드는
// src/admin/에 모여 있어 떼어낼 때 폴더만 옮기면 된다.
//
// **스토어 빌드에서 제외해야 한다.** 출소자용 앱과 함께 나가면 안 된다 (§8.3-4).
import { AdminApp } from "@/admin";

export default function AdminRoute() {
  return <AdminApp />;
}
