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

/** 음성 감정 적응형 RAG(SER 서비스) POST /analyze 응답. */
export interface VoiceEmotion {
  /** angry|disgusted|fearful|sad|neutral|happy 등 top 라벨 */
  top: string;
  /** top 점수 0~1 */
  score: number;
  /** negative | calm */
  group: string;
  /** 격앙·고통 점수(부정 합 + 고각성 절반). group 판정 근거 */
  distress: number;
  /** 전체 감정 점수 맵 */
  scores: Record<string, number>;
}

/** 현재 위치 기반 추천(관할 구 주민센터 + 최근접 공단). 위치 미제공 시 null. */
export interface VoiceLocation {
  gu: string;
  jumin_center_hint: string;
  nearest_koreha: {
    name: string;
    address: string | null;
    phone: string | null;
    distance_km: number;
  } | null;
}

export interface VoiceResult {
  /** 음성 전사(STT) */
  transcript: string;
  emotion: VoiceEmotion;
  /** specific | vague */
  specificity: string;
  /** 감지된 영역. 별도 SER 서비스가 자체 분류로 채우는 값이라
   *  백엔드 지원 항목(RouteOut.key)과는 다른 축이다. */
  area: string;
  /** 매칭된 제도명(없으면 null) */
  matched: string | null;
  /** calm+specific | calm+vague | negative+specific | negative+vague */
  policy: string;
  location: VoiceLocation | null;
  /** 감정×구체성 적응형 응답 */
  response: string;
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
  token?: string | null;
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
export interface ChatStreamHandlers {
  /** triage 결과(급한 지원 항목 2~3개) 도착 */
  onTriage?: (routes: RouteOut[]) => void;
  /** 안내 텍스트 델타(스트리밍 조각) 도착 */
  onText?: (delta: string) => void;
  /** 제도 카드 도착 */
  onCard?: (card: CardData) => void;
  /** 서버가 보낸 사용자용 오류 문구 */
  onError?: (message: string) => void;
  /** 스트림 정상 종료 */
  onDone?: () => void;
}
