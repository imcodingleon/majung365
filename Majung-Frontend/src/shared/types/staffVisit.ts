// 담당자용 방문 요청 계약 미러 (§7.4·§8.1).
//
// 정본: Majung-Backend/app/domains/visit/adapter/inbound/api/router.py
//
// **죄목과 생년월일이 없다.** 담당자 응대에 필요하지 않아 서버가 애초에 담지 않는다.
// 프론트 타입에도 자리를 두지 않는 것이 필터로 거르는 것보다 확실하다.
import type { VisitStatus } from "./visit";

export interface StaffVisitResponse {
  id: string;
  /** 무슨 일로 오는지. 지원 항목 코드(R1~R15)다. */
  route_id: string;
  status: VisitStatus;
  /** 창구에서 본인을 확인하는 데 쓴다. */
  user_name: string;
  /** ISO 8601. 화면이 사람이 읽는 형태로 바꾼다. */
  preferred_at_1: string;
  preferred_at_2: string | null;
  /** 챙겨 온다고 표시한 준비물. */
  prepared_docs: string[];
  /** 사용자가 직접 쓴 말. 없으면 빈 문자열이다. */
  note: string;
  /** 확정된 만날 장소. 확정 전에는 빈 문자열이다. */
  meeting_place: string;
  created_at: string | null;
}

/**
 * 담당자가 상태를 바꿀 때 보내는 값.
 *
 * **확정하려면 `meeting_place`가 반드시 있어야 한다.** 장소 없이 확정하면 서버가
 * 거부한다 — 만날 장소를 아는 것이 이 기능의 핵심이기 때문이다 (§7.1).
 */
export interface StaffVisitAction {
  status: VisitStatus;
  meeting_place?: string;
  /** 다른 시간을 제안할 때. ISO 8601. */
  proposed_at?: string;
  cancel_reason?: string;
}
