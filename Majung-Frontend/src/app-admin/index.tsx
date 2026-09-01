import { AdminApp } from "@/admin";

// 담당자 앱의 첫 화면. 이 변형에서는 여기가 유일한 경로다.
//
// `src/app/admin.tsx`와 같은 것을 그린다. 두 파일이 함께 남아 있는 이유는 웹이다 —
// 시연 중 앱이 안 뜰 때 쓰는 대체 경로가 출소자 쪽 루트에 있다.
export default function AdminHome() {
  return <AdminApp />;
}
