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
   * **화면에는 내지 않는다** (2026-08-26 결정). 근거를 밝히는 일은 배지가 맡는다.
   * 계약에는 남겨 둔다 — 서버가 언제 확인했는지 아는 것과 그것을 사용자에게 보이는
   * 것은 다른 문제이며, 되살릴 때 서버를 다시 고치지 않아도 된다.
   *
   * **기관이 갱신한 날짜가 아니라 우리가 확인한 날짜다.** "○월 ○일 기준"이라고 적으면
   * 기관이 그날 확인했다는 뜻으로 읽힌다 (§6.4).
   */
  verified_note: string;
}

export interface NoticeSource {
  /** 화면에 나갈 한 줄. 예: "경비업법 제10조제1항제3호" */
  label: string;
  url: string;
  /**
   * 조문에서 그대로 옮긴 한 구절.
   *
   * **쉬운 말로 푼 안내 다음에 이것이 온다.** 풀어 쓴 문장만 있으면 사용자가 우리
   * 해석을 그대로 믿어야 하는데, 원문이 함께 있으면 창구에서 그 문장을 짚어
   * 보일 수도 있다. 비어 올 수 있고 그때는 화면이 이 줄을 그리지 않는다.
   */
  quote?: string;
}

/**
 * 수용 사유에 따라 달라지는 안내 (기획서 §9.4 · 2026-09-02 결정).
 *
 * **문장은 서버가 만든다.** 사람이 검수한 법령 근거를 그대로 실어 오므로 화면은
 * 조립하지 않고 받은 대로 낸다. 화면이 문장을 이어 붙이면 검수를 거치지 않은
 * 법률 안내가 생긴다.
 */
export interface RouteNotice {
  /** "blocked" 법으로 막힘 · "caution" 제약이 걸릴 수 있음 · "clear" 해당하지 않음 */
  tone: "blocked" | "caution" | "clear";
  headline: string;
  body: string;
  /** 흔한 오해를 바로잡는 말. 없을 수 있다. */
  myth: string;
  what_to_do: string;
  sources: NoticeSource[];
  /** "이 안내는 마중365가 ○월 ○일에 확인했어요." 없으면 그 줄을 그리지 않는다. */
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
  /**
   * 담당자에게 방문을 미리 알릴 수 있는 항목인지 (§7).
   *
   * **받는 기관이 정해진 항목만 참이다.** R10(은행)·R13(교정시설)·R14(법원)는
   * 아무도 받지 않아 거짓으로 온다 — 받아 두고 아무도 안 보는 것이 가장 나쁘다.
   */
  can_request_visit: boolean;
  card: IntakeCard;
  /**
   * 대화를 열었을 때 입력창 위에 뜨는 첫 질문 (§6.1).
   *
   * **선택 필드다.** 서버가 아직 안 보내는 배포본이 있고, 표에 없는 항목도 있다.
   * 없으면 화면이 기본 문구로 물러선다 — 필드가 빠졌다고 칩 자리가 통째로
   * 비면 안 된다.
   */
  starter_questions?: string[];
  /**
   * 수용 사유에 따라 달라지는 안내 (§9.4).
   *
   * **선택 필드이고 비어 오는 것이 정상이다.** 수용 사유를 밝히지 않았거나 그
   * 항목에 걸리는 제약이 없는 경우가 대부분이며, 서버가 아직 안 보내는 배포본도
   * 있다. 없으면 화면이 이 구역을 아예 그리지 않는다.
   */
  notices?: RouteNotice[];
}

export interface IntakeAnalyzeResponse {
  /** 선행조건 항목이 먼저, 그다음 분야 순서(S1~S6)로 정렬되어 온다. */
  tasks: IntakeTask[];
}
