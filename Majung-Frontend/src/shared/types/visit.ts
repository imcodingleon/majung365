// 방문 요청 상태 (§7.1).
//
// 출소자 화면과 담당자 화면이 같은 상태를 다른 문구로 보여준다. 어느 쪽에도 속하지 않는
// 계약 개념이라 shared에 둔다. 담당자 화면이 나중에 별도 앱으로 떨어져 나갈 때
// 출소자용 코드를 끌고 가지 않게 하려는 목적도 있다 (§8.3).
export type VisitStatus =
  | "sent"
  | "acknowledged"
  | "confirmed"
  | "reschedule_proposed"
  | "completed"
  | "cancelled";
