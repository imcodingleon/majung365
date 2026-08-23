// 출소자용 방문 요청 계약 미러 (§7).
//
// 정본: Majung-Backend/app/domains/visit/adapter/inbound/api/router.py
import type { VisitStatus } from "./visit";

/** 담당자에게 함께 보내는 진단 답변 한 줄 (§7.4-1). */
export interface SharedAnswerInput {
  route_id: string;
  section: string;
  question: string;
  answer: string;
}

export interface VisitCreateRequest {
  route_id: string;
  /** ISO 8601. 1지망은 반드시 있고 2지망은 없을 수 있다. */
  preferred_at_1: string;
  preferred_at_2?: string | null;
  /** 챙겨 오기로 표시한 준비물. */
  prepared_docs: string[];
  /** 미리 말해두고 싶은 것. 쓴 경우에만 담는다. */
  note?: string;
  /**
   * 함께 보내는 진단 답변.
   *
   * **동의 없이 보내면 서버가 403으로 거부한다.** 이 값이 있으면 `share_consented`가
   * 참이어야 한다.
   */
  shared_answers?: SharedAnswerInput[];
  /**
   * 답변을 함께 보내는 데 동의했는지.
   *
   * **답변 없이 이 값만 보내면 동의 기록도 남지 않는다** — 서버가 내용 없는 동의 행을
   * 만들지 않는다. 동의 시각은 서버가 받은 시점으로 기록한다.
   */
  share_consented?: boolean;
}

export interface VisitResponse {
  id: string;
  route_id: string;
  status: VisitStatus;
  preferred_at_1: string;
  preferred_at_2: string | null;
  prepared_docs: string[];
  note: string;
  /**
   * 확정된 만날 사람과 만날 장소.
   *
   * **둘이 따로 온다.** §7.1이 "만날 사람의 이름과 만날 장소가 반드시 표시되어야 한다"고
   * 정했고, 담당자 이름은 서버가 처리한 담당자 id로 채운다 — 합쳐 두면 담당자가
   * 교체될 때 옛 이름이 장소 문자열에 박혀 남는다.
   */
  staff_name: string;
  meeting_place: string;
  /**
   * **담당자가 확정을 누른 시각이다. 만나기로 한 시각이 아니다.**
   *
   * 이것을 방문 시각으로 쓰면 새벽에 만나자는 안내가 나간다. 만나기로 한 시각을 담을
   * 자리는 아직 계약에 없다 — 그때까지 확정 문구에서 시각을 빼고 만날 사람과 장소만 낸다.
   */
  confirmed_at: string | null;
  /** 보낸 시각. 하루 상한을 미리 알려주는 데 쓴다 (§7.5). */
  created_at: string | null;
  /** 담당자가 다른 시간을 제안했을 때. */
  proposed_at: string | null;
  cancel_reason: string;
  /** 채팅방이 열려 있는지. 담당자가 확인하기 전에는 거짓이다 (§7.3-4). */
  chat_available: boolean;
}

/**
 * 담당자 화면에 실려 오는 진단 답변 (§7.4-1).
 *
 * **서버가 방문 목적에 가까운 순서로 정렬해 보낸다.** 그 방문의 항목 → 같은 기관에서
 * 처리하는 항목 → 다른 기관 순이다. **화면에서 순서를 다시 매기지 않는다.**
 */
export interface SharedAnswerOut {
  route_id: string;
  section: string;
  question: string;
  answer: string;
}
