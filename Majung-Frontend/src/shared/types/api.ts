// 백엔드(Majung-Backend) API 계약을 그대로 미러링한 타입.
// 계약이 바뀌면 이 파일을 같은 커밋에서 갱신한다.

/** triage가 고른 지원 항목 (CAP-2). rank=1이 가장 급함. */
export interface RouteOut {
  /** 지원 항목 코드 R1~R4 · R6~R15 (R5는 결번) */
  key: string;
  /** "신분증", "공단 긴급지원" 등 표시 라벨 */
  label: string;
  /** 우선순위 (1이 가장 급함) */
  rank: number;
  /** 왜 급한지 쉬운 말 설명 */
  reason: string;
}

/** 제도 안내 카드 (CAP-3, 지식베이스 매칭). KB 항목만 인용 — 환각 없음. */
export interface CardData {
  institution_id: string;
  /** 제도명 */
  name: string;
  /** 이 제도가 근거가 되는 지원 항목 라벨. 여러 항목에 걸치면 가운뎃점으로 이어 붙는다. */
  route_label: string;
  /** 쉬운 말 요약 */
  summary_easy: string;
  /** 어디서 신청하는지 */
  where: string;
  /** 필요 서류 목록 */
  docs: string[];
  /** 다음 행동 1개 */
  next_step: string;
  /** 기한 경고 (없으면 null) */
  deadline: string | null;
  /** 근거 출처 URL */
  source_url: string;
  /**
   * 이 안내를 언제 확인했는지. 서버가 완성된 문장으로 준다 (§6.4 ①단계).
   *
   * **카드마다 자기 날짜를 갖는다.** 답변 배지에 하나를 골라 붙이면 그 날짜가 어느
   * 카드의 것인지 알 수 없고, 답변 말풍선 안에 있으면 "답변을 확인했다"로 읽힌다.
   * 확인한 것은 이 제도 안내이지 그 답변이 질문에 맞다는 판정이 아니다.
   */
  verified_note: string;
}

/**
 * 주민센터. `GET /api/district-offices` 응답 항목.
 *
 * **전화번호가 없다.** 원본(행정안전부 '읍면동 하부행정기관 현황')이 주지 않는 값이라
 * 파싱 누락이 아니다. 전화가 필요하면 정부민원안내콜센터 110으로 넘긴다.
 */
export interface DistrictOffice {
  sido: string;
  sigungu: string;
  /** "오금동". 위치로 알아낸 동과 맞춰 그 사람의 주민센터를 짚는다. */
  dong: string;
  kind: string;
  name: string;
  zipcode: string;
  address: string;
}

/** 기관 갈래. 지원 항목마다 안내할 종류가 다르다 (§5.4). */
export type InstitutionKind = "branch" | "head" | "training" | "hug" | "mental_health";

/**
 * 공단 기관과 지역 센터. `GET /api/institutions?route=…&sido=…&district=…` 응답 항목.
 *
 * **공단 기관은 지역이 안 맞아도 목록에 남는다.** 전국에 몇 곳뿐이라(허그상담소 3곳)
 * 지역으로 거르면 사라지고, 그러면 주 경로가 화면에서 없어진다. `kind`로 갈라 그린다.
 */
export interface Institution {
  name: string;
  kind: InstitutionKind;
  sido: string;
  district: string;
  address: string;
  phone: string;
}

/** 지원기관 (CAP-5 지도). GET /api/centers 응답 항목. */
export interface Center {
  id: string;
  /** 법무보호공단 | 주민센터 | 고용센터 */
  category: string;
  name: string;
  address: string;
  phone: string;
  /** 운영시간 문구 */
  hours: string;
  lat: number;
  lng: number;
  tags: string[];
}

export type ChatRole = "user" | "assistant";

/** 대화 히스토리 한 턴. */
export interface Turn {
  role: ChatRole;
  content: string;
}

/** POST /api/chat 요청. token은 게이트 통과 후 발급. */
export interface ChatRequest {
  message: string;
  history: Turn[];
  /**
   * 세션 토큰. `Authorization` 헤더로 나간다.
   *
   * **이것이 없으면 대화가 저장되지 않는다.** 서버는 이 헤더로 누구인지 가려 대화를
   * 남기고(§6.3), 모르면 답만 하고 흘려보낸다 — 가입 전에 챗을 열어보는 흐름을 막지
   * 않으려고 그렇게 두었다. 그래서 **안 보내도 오류가 나지 않는다.** 실제로 오래
   * 빠져 있었고, 상담 탭이 비는 것으로만 드러났다.
   *
   * 게이트 토큰이 아니다. 그쪽은 본문으로 가며 §2.3에서 폐지됐다.
   */
  token?: string | null;
  /**
   * 어느 할 일 카드에서 연 대화인지 (R1~R4·R6~R15).
   *
   * **triage를 건너뛰지 않고 순서만 바꾼다.** R14 카드에서 열었어도 신분증을 물을 수
   * 있으므로 모델이 고른 항목도 뒤에 남고 근거 검색이 둘 다 훑는다. 모르는 코드를
   * 보내면 서버가 무시한다.
   */
  route_id?: string;
}

/** 온보딩 그래프 노드 상태값(백엔드 NodeState와 동일). */
export type NodeStateValue = "O" | "X" | "BLOCKED" | "UNKNOWN";

/** POST /api/onboarding/analyze 요청 — 노드별 버튼 답변 1건. */
export interface NodeAnswerInput {
  node_id: string;
  state: NodeStateValue;
}

/** POST /api/onboarding/analyze 요청 바디. */
export interface AnalyzeRequest {
  answers: NodeAnswerInput[];
  /** 마지막 자유서술(선택) — 있으면 C6이 14노드를 다시 훑어 버튼 답변 위에 덮어쓴다. */
  narrative?: string;
}

/** POST /api/onboarding/analyze 응답 — 오늘의 과제 카드 1개(C6+C7 결과). */
export interface TaskCard {
  node_id: string;
  node_name: string;
  summary_easy: string;
  where: string;
  docs: string[];
  next_step: string;
  deadline: string | null;
  source_url: string;
  /** 왜 이걸 먼저 하는지 한 줄(기한 임박/해금 수/기본 안내). */
  priority_reason: string;
  duration_days: number;
  /** 순환 해소 불가로 진입점(수용증명서)에 폴백했는지 여부. */
  is_fallback: boolean;
  /** 이번 계산에 쓰인 14노드 전체 상태 스냅샷 — "완료 처리" 재계산에 그대로 되돌려보낸다. */
  resolved_states: Record<string, NodeStateValue>;
}

/** SSE 스트림 이벤트를 소비하는 콜백 묶음. */
/**
 * 답이 어디서 왔는지 (§6.4).
 *
 * **답변 텍스트보다 먼저 온다.** 웹 검색으로 넘어가는 경우 `notice`에 사전 고지 문구가
 * 실리는데, §6.4가 "확실성이 낮다는 신호가 정보보다 앞서야 한다"고 정했기 때문이다.
 * 나중에 "인터넷 정보였습니다"라고 덧붙이면 이미 사실로 받아들인 뒤다.
 */
export interface EvidenceEvent {
  /** `confirmed`는 수집한 근거 문서, `web`은 인터넷 검색이다. */
  stage: "confirmed" | "web";
  /** 웹 검색으로 넘어갈 때 답변보다 먼저 낼 문장. 확인한 자료면 빈 문자열이다. */
  notice: string;
}

/**
 * 저장된 대화 한 줄 (§6.3).
 *
 * **서버가 암호화해 보관한다.** 예선에서는 대화를 남기지 않았는데, 남지 않으면
 * 어제 받은 안내가 사라져서 본선에서 뒤집었다.
 */
export interface StoredChatTurn {
  role: "user" | "assistant";
  content: string;
  /** 보낸 시각(ISO). */
  at: string;
}

export interface ChatStreamHandlers {
  /** triage 결과(급한 지원 항목 2~3개) 도착 */
  onTriage?: (routes: RouteOut[]) => void;
  /** 근거 단계 도착. **답변 텍스트보다 먼저 온다** (§6.4). */
  onEvidence?: (evidence: EvidenceEvent) => void;
  /** 안내 텍스트 델타(스트리밍 조각) 도착 */
  onText?: (delta: string) => void;
  /** 제도 카드 도착 */
  onCard?: (card: CardData) => void;
  /** 서버가 보낸 사용자용 오류 문구 */
  onError?: (message: string) => void;
  /** 스트림 정상 종료 */
  onDone?: () => void;
}
