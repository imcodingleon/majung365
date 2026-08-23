// POST /api/intake/analyze 계약 미러 (§3.8·§4.1).
//
// 27문항 답변을 보내면 할 일 목록이 돌아온다. **서버가 진행 상태를 들고 있지 않다.**
// 완료한 항목을 `completed`에 담아 다시 부르면 그것을 뺀 목록이 온다.
import type { RouteId } from "./route";

/** 화면에서 사라진 답은 빠진 채로 온다. 특정 키가 항상 있다고 가정하지 않는다 (§3.8). */
export type IntakeAnswerMap = Record<string, string | readonly string[]>;

export interface IntakeAnalyzeRequest {
  answers: IntakeAnswerMap;
  /** 이미 마친 지원 항목. 완료 처리가 이 배열로 이뤄진다. */
  completed: readonly string[];
  /** 마지막 자유 서술. 지금은 판정에 쓰이지 않는다. */
  narrative?: string | null;
}

/**
 * 한 지원 항목에서 신청할 수 있는 경로.
 *
 * **항상 최소 하나다.** 길이로 분기하지 않아도 된다. 둘 이상인 경우는 R2처럼 공단과
 * 정부 제도가 함께 열리는 병렬 안내다 (§12-15).
 */
export interface IntakeCardOption {
  /** 기관 또는 제도 이름. 여럿일 때 어느 쪽 안내인지 구별한다 */
  org: string;
  where: string;
  next_step: string;
  docs: string[];
  /**
   * 창구 안내 (§6.4). 갈 곳이 하나로 정해지는 항목에만 있다.
   * 전화를 걸면 무엇을 물어야 할지 또 판단해야 하지만 창구에서는 한 문장만 말하면 된다.
   */
  desk_place: string;
  desk_say: string;
  /** 담당 기관 연락처 (§6.4 ③단계). **서버가 붙인다. LLM이 만들지 않는다.** */
  contact_org: string;
  contact_phone: string;
  /** 상담 가능 시간이 확인된 곳만 채워진다. 132처럼 점심에 끊기는 번호가 있다. */
  contact_hours: string;
}

export interface IntakeCard {
  institution_id: string;
  name: string;
  summary_easy: string;
  docs: string[];
  deadline: string | null;
  source_url: string;
  /** 아래 넷은 §4.1의 결과 카드 필드다. 제도 요건 문구가 확정되기 전이라 비어 있다. */
  benefit_summary: string;
  eligibility: string[];
  steps: string[];
  cautions: string[];
  options: IntakeCardOption[];
  /** 근거 문서 출처들. */
  source_urls: string[];
  /**
   * "이 안내는 마중365가 2026년 8월 23일에 확인했어요."
   *
   * **기관이 갱신한 날짜가 아니라 우리가 확인한 날짜다.** "○월 ○일 기준"이라고 적으면
   * 기관이 그날 확인했다는 뜻으로 읽힌다 (§6.4).
   */
  verified_note: string;
}

export interface IntakeTask {
  route_id: RouteId;
  route_label: string;
  /** 인덱스 탭용 짧은 이름. 5자까지 들어가고 6자부터 잘린다. */
  tab_label: string;
  section_id: string;
  section_label: string;
  /** 다른 항목의 선행조건인지. 사용자별 판정이 아니라 그래프 구조의 사실이다. */
  blocks_others: boolean;
  card: IntakeCard;
}

export interface IntakeAnalyzeResponse {
  /** 선행조건 항목이 먼저, 그다음 분야 순서(S1~S6)로 정렬되어 온다. */
  tasks: IntakeTask[];
}
