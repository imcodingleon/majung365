// 담당자용 방문 요청 계약 미러 (§7.4·§8.1).
//
// 정본: Majung-Backend/app/domains/visit/adapter/inbound/api/router.py
//
// **죄목과 생년월일이 없다.** 담당자 응대에 필요하지 않아 서버가 애초에 담지 않는다.
// 프론트 타입에도 자리를 두지 않는 것이 필터로 거르는 것보다 확실하다.
import type { VisitStatus } from "./visit";

/** 담당자에게 온 진단 답변 한 줄. **id가 아니라 사람이 읽는 문장으로 온다.** */
export interface SharedAnswerOut {
  /** 어느 지원 항목의 문항인지. 서버가 이 값으로 정렬한다. */
  route_id: string;
  section: string;
  question: string;
  answer: string;
}

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
  /** 만나기로 한 시각. **확정을 누른 시각이 아니다.** 확정 전에는 없다. */
  confirmed_for?: string | null;
  created_at: string | null;
  /**
   * 본인이 함께 보내기로 한 초기 진단 답변 (§7.4-1).
   *
   * **서버가 방문 목적에 가까운 순서로 정렬해 보낸다** — 그 방문의 항목, 같은 기관에서
   * 처리하는 항목, 다른 기관 순이다. **화면이 순서를 다시 매기지 않는다.**
   *
   * 동의하지 않았으면 빈 배열이다. 예전 요청에는 이 필드가 아예 없을 수 있다.
   */
  /**
   * 마지막으로 오간 말 한 줄. 아직 아무 말도 없으면 빈 문자열이다.
   *
   * **같은 이유로 서버가 실어 보낸다.** 이것이 없으면 대화 목록이 제목만 늘어선 표가
   * 되어, 어제 어디까지 이야기했는지 열어보기 전에는 알 수 없다.
   */
  last_message?: string;
  /** 마지막으로 말한 때(ISO 8601). 목록 순서를 이 값으로 정한다. */
  last_message_at?: string | null;
  shared_answers?: SharedAnswerOut[];
  /**
   * 담당자가 먼저 읽는 요약 (§7.4).
   *
   * **원문을 대체하지 않는다.** 화면은 요약을 위에 놓고, 답변 원문은 버튼을 눌러
   * 펼쳐 보게 한다. 만들지 못했으면 빈 문자열이다.
   */
  summary?: string;
  /**
   * 요약이 어떤 상태인가.
   *
   * **없는 것과 못 만든 것을 구분한다.** 둘을 같게 다루면 답변을 보내지 않은
   * 요청에도 "요약을 만들지 못했습니다"가 뜬다 — 있지도 않은 것이 빠진 것처럼 보인다.
   * 예전 요청에는 이 필드가 아예 없을 수 있다.
   */
  summary_status?: SummaryStatus;
}

/** none: 만들 것이 없다 / pending: 만드는 중 / ready: 있다 / failed: 못 만들었다 */
export type SummaryStatus = "none" | "pending" | "ready" | "failed";

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
  /**
   * 확정할 때 만나기로 한 시각. ISO 8601.
   *
   * **담당자가 화면에서 정한다** (2026-08-26 결정). 안 보내면 서버가 출소자가 적어낸
   * 때로 채우는데, 그러면 담당자가 바꾼 때가 조용히 사라진다.
   */
  confirmed_for?: string | null;
  cancel_reason?: string;
}
