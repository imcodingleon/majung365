// 모든 백엔드 HTTP 호출의 단일 관문 (SSE 포함).
// 비즈니스 로직 없음 — 요청 조립 / 응답 파싱 / 오류 정규화만.
// 비밀 금지: 여기에 API 키를 넣지 않는다. AI 호출은 백엔드가 담당.

import type { IntakeAnswerMap } from "../types/intake";
import type {
  IntakeAnalyzeRequest,
  IntakeAnalyzeResponse,
  AnalyzeRequest,
  RouteOut,
  CardData,
  Center,
  ChatRequest,
  DistrictOffice,
  Institution,
  ChatStreamHandlers,
  EvidenceEvent,
  StoredChatTurn,
  TaskCard,
} from "../types";
import type {
  MeResponse,
  RestoreResponse,
  SignupRequest,
  SignupResponse,
  UpdateMeRequest,
} from "../types/account";
import type { StaffVisitAction, StaffVisitResponse } from "../types/staffVisit";
import type { VisitCreateRequest, VisitResponse } from "../types/visitRequest";
import type {
  StaffLoginRequest,
  StaffLoginResponse,
  StaffMeResponse,
} from "../types/staff";

/** 노출 허용 변수만 사용(EXPO_PUBLIC_). 미설정 시 로컬 기본값. */
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";


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
const INVALID_ERROR = "보내려는 내용이 너무 많거나 형식이 맞지 않아요. 고르신 항목을 줄여서 다시 보내 주세요.";

/** 응답 body(JSON detail)에서 사용자용 문구를 최대한 뽑아낸다. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: unknown };
    if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
    // **FastAPI의 검증 오류(422)는 `detail`이 배열이다.** 위 문자열 검사에서 걸러져
    // 통신 오류 문구가 나가면, 사용자는 연결 탓인 줄 알고 다시 누르기만 반복한다.
    // 배열 안의 문구는 영어라 그대로 보여줄 수 없으므로 무엇을 해야 하는지만 말한다.
    if (Array.isArray(data.detail)) return INVALID_ERROR;
  } catch {
    // JSON 아님 — 기본 문구로
  }
  return DEFAULT_ERROR;
}

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

// ── 가입·내 정보 (§2.4·§2.5·§9.4) ────────────────────────────────────

/**
 * POST /api/signup — 가입.
 *
 * **여기서부터 서버에 저장이 남는다.** 그래서 §3.5 고지("암호화해서 보관해요")가
 * 사실이 되고, 동시에 §9.4의 삭제 경로가 반드시 함께 있어야 한다.
 *
 * 응답의 `session_token`은 **다시 조회할 수 없다.** 받는 즉시 보관한다.
 * 할 일 목록도 함께 오므로 곧바로 `intake/analyze`를 부르지 않는다.
 */
export async function postSignup(req: SignupRequest): Promise<SignupResponse> {
  const res = await fetch(`${API_BASE}/api/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as SignupResponse;
}

/**
 * GET /api/tasks — 세션 토큰만으로 할 일을 되살린다 (§5.2).
 *
 * **답변을 다시 보내지 않는다.** 서버에 남아 있는 것은 답변이 아니라 판정이고,
 * 카드 본문은 그때그때 지식 베이스에서 만들어진다. 그래서 기기가 진단 답변을
 * 들고 있지 않아도 같은 목록이 돌아온다.
 *
 * 404면 이어서 볼 것이 없다는 뜻이다 — 저장이 꺼져 있던 때 가입한 경우다.
 */
export async function getTasks(token: string): Promise<RestoreResponse> {
  const res = await fetch(`${API_BASE}/api/tasks`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as RestoreResponse;
}

/**
 * PUT /api/tasks — 상황 알아보기를 다시 하고 할 일을 새로 받는다 (§3.7).
 *
 * **가입 정보는 건드리지 않는다.** 이름·생일·출소날짜·동의는 그대로 두고 분야 답만
 * 갈아 끼운다. 서버는 여기서도 답변 원문을 저장하지 않고 판정만 남긴다 (§9.1).
 *
 * **끝낸 표시는 지워진다.** 할 일이 새로 정해진 것이라, 예전에 마친 표시를 그대로
 * 두면 이번에 처음 나온 항목이 이미 끝난 것으로 보인다.
 */
export async function putIntake(
  token: string,
  answers: IntakeAnswerMap,
): Promise<RestoreResponse> {
  const res = await fetch(`${API_BASE}/api/tasks`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as RestoreResponse;
}

/**
 * PUT /api/tasks/completed — 마친 항목을 서버에 남긴다.
 *
 * **전체 목록을 보낸다.** 되돌리기가 있어서 더하기만으로는 표현되지 않는다 (§5.2).
 */
export async function putCompleted(
  token: string,
  completed: readonly string[],
): Promise<RestoreResponse> {
  const res = await fetch(`${API_BASE}/api/tasks/completed`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ completed }),
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as RestoreResponse;
}

/** GET /api/me — 내 정보 열람. **죄목 값은 내려오지 않는다** (§2.5). */
export async function getMe(token: string): Promise<MeResponse> {
  const res = await fetch(`${API_BASE}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as MeResponse;
}

/** PATCH /api/me — 바꿀 항목만 보낸다. 죄목은 고치는 것이 아니라 철회한다 (§9.5). */
export async function patchMe(token: string, req: UpdateMeRequest): Promise<MeResponse> {
  const res = await fetch(`${API_BASE}/api/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as MeResponse;
}

/**
 * DELETE /api/me — 모든 정보 삭제 (§9.4).
 *
 * **저장한다고 알리면서 지울 길이 없으면 안 된다.** 가입을 서버에 붙이는 순간부터
 * 이 경로가 함께 살아 있어야 §3.5 고지가 거짓말이 되지 않는다. 서버가 즉시 처리한다.
 */
export async function deleteMe(token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/me`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  // 204가 정상. 이미 지워진 상태(401·404)도 "지워졌다"로 본다 — 사용자가 원한 결과는 같다.
  if (!res.ok && res.status !== 401 && res.status !== 404) {
    throw new ApiError(res.status, await errorMessage(res));
  }
}

// ── 방문 요청 (§7) ────────────────────────────────────────────────────

/**
 * POST /api/visits — 담당자에게 방문을 미리 알린다.
 *
 * **상한이 서버에서 판정된다** (§7.5). 하루 3건·미확정 5건·같은 항목 1건을 넘으면
 * 거부되고 그 이유가 문구로 온다. 화면은 막지 않고 이유를 그대로 보여준다.
 */
export async function postVisit(token: string, req: VisitCreateRequest): Promise<VisitResponse> {
  const res = await fetch(`${API_BASE}/api/visits`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as VisitResponse;
}

/** GET /api/visits — 내가 보낸 방문 요청들. 확정되면 만날 사람과 장소가 함께 온다. */
export async function getVisits(token: string): Promise<VisitResponse[]> {
  const res = await fetch(`${API_BASE}/api/visits`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as VisitResponse[];
}

/** POST /api/visits/{id}/cancel — 보낸 요청을 거둔다. */
export async function cancelVisit(token: string, id: string): Promise<VisitResponse> {
  const res = await fetch(`${API_BASE}/api/visits/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as VisitResponse;
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

/**
 * GET /api/staff/visits — 담당자가 보는 방문 요청 목록.
 *
 * **다른 기관 요청은 아예 오지 않는다.** 서버가 거르는 것이지 화면이 거르는 것이 아니다.
 */
export async function getStaffVisits(token: string): Promise<StaffVisitResponse[]> {
  const res = await fetch(`${API_BASE}/api/staff/visits`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as StaffVisitResponse[];
}

/**
 * PATCH /api/staff/visits/{id} — 상태 변경.
 *
 * **남의 기관 요청은 id를 알아도 거부된다.** 화면이 막는 것이 아니다.
 */
export async function patchStaffVisit(
  token: string,
  id: string,
  action: StaffVisitAction,
): Promise<StaffVisitResponse> {
  const res = await fetch(`${API_BASE}/api/staff/visits/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(action),
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as StaffVisitResponse;
}

/**
 * GET /api/district-offices — 그 시군구의 주민센터.
 *
 * **좌표는 보내지 않는다** (§5.4). 기기에서 알아낸 시도·시군구 이름만 보낸다.
 * 붙여 쓴 표기("수원시장안구")도 서버가 받아 정규화하므로 그대로 넘긴다.
 */
export async function getDistrictOffices(
  sido: string,
  sigungu: string,
): Promise<DistrictOffice[]> {
  const qs = `?sido=${encodeURIComponent(sido)}&sigungu=${encodeURIComponent(sigungu)}`;
  const res = await fetch(`${API_BASE}/api/district-offices${qs}`);
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as DistrictOffice[];
}

/**
 * GET /api/institutions — 그 지원 항목에서 안내할 기관.
 *
 * `route`로 물으면 그 항목에 맞는 종류가 함께 온다 — R8이면 허그상담소와
 * 정신건강복지센터, R6이면 지부와 교육원이다 (§5.4).
 */
export async function getInstitutions(
  route: string,
  sido: string,
  district: string,
): Promise<Institution[]> {
  const qs =
    `?route=${encodeURIComponent(route)}` +
    `&sido=${encodeURIComponent(sido)}&district=${encodeURIComponent(district)}`;
  const res = await fetch(`${API_BASE}/api/institutions${qs}`);
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as Institution[];
}

/**
 * GET /api/centers — 지도에 찍을 기관.
 *
 * **지역을 주면 주민센터와 정신건강복지센터까지 함께 온다.** 주지 않으면 법무보호공단
 * 여덟 곳만 온다 — 전국 주민센터 3,555건을 통째로 받을 수는 없다.
 *
 * 갈래 거르기는 화면의 칩이 한다. 여기서는 지역만 좁힌다.
 */
export async function getCenters(place?: { sido: string; district: string }): Promise<Center[]> {
  const qs = place
    ? `?sido=${encodeURIComponent(place.sido)}&district=${encodeURIComponent(place.district)}`
    : "";
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
 * GET /api/chat/{route_id} — 그 할 일에서 나눈 지난 대화 (§6.3).
 *
 * **저장을 꺼두면 빈 배열이 온다.** 오류가 아니므로 화면은 대화가 없는 것으로 다룬다.
 */
/**
 * GET /api/chat-rooms — 대화가 있는 할 일들. 최근에 말한 것이 앞에 온다.
 *
 * **본문은 오지 않는다.** 상담 탭이 목록을 그리는 데 필요한 것은 어느 방인지뿐이고,
 * 대화 내용은 그 방을 열 때 온다.
 */
export async function getChatRooms(token: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/chat-rooms`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as string[];
}

export async function getChatHistory(token: string, routeId: string): Promise<StoredChatTurn[]> {
  const res = await fetch(`${API_BASE}/api/chat/${encodeURIComponent(routeId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as StoredChatTurn[];
}

/**
 * DELETE /api/chat/{route_id} — 이 대화를 지운다 (§6.3-2).
 *
 * **지울 길이 있어야 저장이 성립한다.** 자동 로그인 상태에서 기기를 잡은 사람이
 * 대화를 읽을 수 있고, 거기에는 사용자가 가장 사적으로 말한 것이 들어 있다.
 */
export async function deleteChatHistory(token: string, routeId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/${encodeURIComponent(routeId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
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
    case "evidence":
      handlers.onEvidence?.(parsed as EvidenceEvent);
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
