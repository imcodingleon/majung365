// 모든 백엔드 HTTP 호출의 단일 관문 (SSE 포함).
// 비즈니스 로직 없음 — 요청 조립 / 응답 파싱 / 오류 정규화만.
// 비밀 금지: 여기에 API 키를 넣지 않는다. AI 호출은 백엔드가 담당.

import type {
  IntakeAnalyzeRequest,
  IntakeAnalyzeResponse,
  AnalyzeRequest,
  RouteOut,
  CardData,
  Center,
  ChatRequest,
  ChatStreamHandlers,
  TaskCard,
} from "../types";
import type {
  StaffLoginRequest,
  StaffLoginResponse,
  StaffMeResponse,
} from "../types/staff";

/** 노출 허용 변수만 사용(EXPO_PUBLIC_). 미설정 시 로컬 기본값. */
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * 음성 감정 적응형 RAG(SER) 서비스 베이스 URL. PC의 SER 서버 → 폰 테스트 시 cloudflared 터널 HTTPS.
 * 기존 백엔드(EC2)와 분리 — SER 모델이 무거워 PC/GPU에서 자체호스팅.
 */
/**
 * 🔒 터널 접근용 '약한 게이트' 토큰(선택). EXPO_PUBLIC_이라 번들에 노출됨 → 진짜 비밀 아님.
 * 실제 방어: CORS 오리진 제한 + 테스트할 때만 터널 on + 서버 오디오 무영속. 데모 한정 사용.
 */

/** 서버가 준 사용자용 문구(detail)를 담는 오류. UI는 message를 그대로 보여줘도 됨. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const DEFAULT_ERROR = "지금 잠시 연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.";

/** 응답 body(JSON detail)에서 사용자용 문구를 최대한 뽑아낸다. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: unknown };
    if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
  } catch {
    // JSON 아님 — 기본 문구로
  }
  return DEFAULT_ERROR;
}

/**
 * POST {SER}/analyze — 음성(Blob) + 현재위치 → 감정×구체성 적응형 응답.
 * multipart. Content-Type은 브라우저가 boundary와 함께 자동 설정하므로 지정하지 않는다.
/**
 * POST /api/intake/analyze — 초기 진단 답변 → 할 일 목록 (§3.8·§4.1).
 *
 * 서버가 진행 상태를 들고 있지 않다. 완료한 항목을 `completed`에 담아 다시 부르면
 * 그것을 뺀 목록이 온다. **답하지 않은 문항은 요청에 담기지 않으며 그것이 정상이다.**
 */
export async function postIntakeAnalyze(
  req: IntakeAnalyzeRequest,
): Promise<IntakeAnalyzeResponse> {
  const res = await fetch(`${API_BASE}/api/intake/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as IntakeAnalyzeResponse;
}

// ── 담당자 (§8.2) ─────────────────────────────────────────────────────
//
// **가입 엔드포인트가 없다.** 계정은 운영 쪽에서 발급한다. 관리자 앱은 정의상
// 출소자 명단을 다루므로 스스로 계정을 만드는 길을 열면 그게 곧 구멍이 된다.

/**
 * POST /api/staff/login — 담당자 로그인.
 *
 * **아이디가 틀렸는지 비밀번호가 틀렸는지 서버가 구분해 알리지 않는다.** 구분하면
 * 존재하는 아이디를 찾아내는 길이 되기 때문이다. 화면도 그 문구를 그대로 낸다.
 */
export async function postStaffLogin(req: StaffLoginRequest): Promise<StaffLoginResponse> {
  const res = await fetch(`${API_BASE}/api/staff/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as StaffLoginResponse;
}

/** GET /api/staff/me — 로그인한 담당자 정보. 토큰이 아직 살아 있는지 확인하는 데도 쓴다. */
export async function getStaffMe(token: string): Promise<StaffMeResponse> {
  const res = await fetch(`${API_BASE}/api/staff/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as StaffMeResponse;
}

/**
 * POST /api/staff/logout — 서버에서 세션을 지운다.
 *
 * **실패해도 화면은 로그아웃한다.** 공용 기기를 전제하므로 나가는 길이 막히면 안 된다.
 * 서버 세션은 8시간 뒤 어차피 만료된다.
 */
export async function postStaffLogout(token: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/staff/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // 연결이 끊겨도 화면은 나간다.
  }
}

/** GET /api/centers — 지원기관 목록(지도용). category로 필터 가능. */
export async function getCenters(category?: string): Promise<Center[]> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : "";
  const res = await fetch(`${API_BASE}/api/centers${qs}`);
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as Center[];
}

/** POST /api/onboarding/analyze — 온보딩 답변(코어 9노드) → 오늘의 과제 카드 1개(C6+C7). */
export async function postAnalyze(req: AnalyzeRequest): Promise<TaskCard> {
  const res = await fetch(`${API_BASE}/api/onboarding/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as TaskCard;
}

/**
 * POST /api/chat (SSE) — triage → text(델타) → card → done 스트림을 소비한다.
 *
 * 예선은 웹(Vercel) 전제라 fetch + ReadableStream 리더로 파싱한다.
 * ⚠️ 본선 네이티브: RN fetch는 body 스트리밍 미지원 → react-native-sse/XHR 전환 필요.
 *
 * @param signal 중단용 AbortSignal (화면 이탈 시 취소)
 */
export async function streamChat(
  req: ChatRequest,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(req.token ? { Authorization: `Bearer ${req.token}` } : {}),
    },
    body: JSON.stringify({
      message: req.message,
      history: req.history,
      // 값이 없으면 키를 아예 넣지 않는다. 빈 문자열을 보내면 서버가 모르는 코드로 받는다.
      ...(req.route_id ? { route_id: req.route_id } : {}),
    }),
    signal,
  });

  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  if (!res.body) {
    // 웹이 아니거나 스트리밍 미지원 환경
    throw new ApiError(0, "이 환경에서는 실시간 답변을 받을 수 없어요.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");

      // 완성된 SSE 프레임(빈 줄 구분)만 처리
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        dispatchFrame(frame, handlers);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** SSE 프레임 한 개(event/data 라인들)를 파싱해 해당 핸들러로 보낸다. */
function dispatchFrame(frame: string, handlers: ChatStreamHandlers): void {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue; // 주석/핑
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  const data = dataLines.join("\n");
  if (event === "done") {
    handlers.onDone?.();
    return;
  }
  if (!data) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return; // 깨진 프레임은 조용히 무시
  }

  switch (event) {
    case "triage":
      handlers.onTriage?.((parsed as { routes: RouteOut[] }).routes);
      break;
    case "text":
      handlers.onText?.((parsed as { delta: string }).delta);
      break;
    case "card":
      handlers.onCard?.(parsed as CardData);
      break;
    case "error":
      handlers.onError?.((parsed as { message: string }).message);
      break;
    default:
      break;
  }
}
