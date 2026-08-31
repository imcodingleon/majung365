// 시연 프레임 안에서만 도는 목업 설치기.
//
// **이 함수는 `/showcase/preview/*` 프레임에서만 불린다.** 일반 라우트는 이 파일을
// 부르지 않으며, 부르는 자리(`src/app/showcase/preview/index.tsx`)가 경로를 먼저 본다.
//
// 무엇을 갈아 끼우는가
//   1. `window.fetch` — 백엔드로 가는 요청을 전부 가로챈다
//   2. `XMLHttpRequest`와 `WebSocket` — socket.io를 가짜 서버로 받는다 (`fakeSocket.ts`)
//   3. `window.localStorage` — **프레임 안에서만 쓰는 가짜 저장소로 바꾼다**
//   4. `startSession()` — 가짜 세션을 넣는다. 없으면 화면이 전부 가입으로 튕긴다
//   5. `navigator.geolocation` — 보는 사람의 실제 위치를 읽지 않는다
//   6. 애니메이션 정지 — 캡처할 때 중간 상태가 찍히지 않게 한다
//
// **왜 저장소까지 바꾸는가.** iframe은 앱과 같은 오리진이다. 진짜 `localStorage`를 그대로
// 쓰면 시연용 가짜 위치와 가짜 토큰이 사용자의 실제 앱에 남는다. 시연 한 번에 남의 앱
// 상태가 바뀌는 것은 받아들일 수 없다. 프레임 안에서만 사는 메모리 저장소로 바꾼다.
//
// **어떤 경우에도 실서버로 나가지 않는다.** 표에 없는 주소도 네트워크로 내보내지 않고
// 콘솔 경고와 함께 빈 성공 응답을 돌려준다. 시연 중에 누른 버튼이 실제 DB에 흔적을
// 남기면 안 되기 때문이다.
import { startSession } from "@/shared/utils/session";
import type { StaffVisitResponse } from "@/shared/types/staffVisit";

import { installFakeSocketIo } from "./fakeSocket";
import {
  CENTERS,
  CHAT_HISTORY,
  CHAT_ROOMS,
  CHAT_STREAM,
  DISTRICT_OFFICES,
  INSTITUTIONS,
  ME,
  RESTORE,
  ROOM_MESSAGES,
  SEEDED_STORAGE,
  SESSION,
  STAFF_LOGIN,
  STAFF_ME,
  STAFF_VISITS,
  TASKS,
  VISITS,
  type SseFrame,
} from "./mocks/showcase-fixtures";

/** 백엔드 주소. `api.ts`와 같은 규칙으로 읽는다. */
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

/** 두 번 설치하지 않는다. 라우트가 다시 마운트되어도 한 번만 돈다. */
let installed = false;

// ── 프레임 안에서만 바뀌는 상태 ──────────────────────────────────────
//
// 완료 체크와 방문 요청 보내기를 실제로 눌러 볼 수 있어야 시연이 된다. 서버에 보내는
// 대신 이 값들을 고치고 그대로 돌려준다.

let completed: string[] = [...RESTORE.completed];
let visits = VISITS.map((v) => ({ ...v }));
let staffVisits = STAFF_VISITS.map((v) => ({ ...v }));

// ── 1. 가짜 저장소 ────────────────────────────────────────────────────

/** `Storage` 인터페이스를 그대로 흉내 낸 메모리 저장소. */
function memoryStorage(seed: Record<string, string>): Storage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage;
}

function installStorage(): void {
  const fake = memoryStorage(SEEDED_STORAGE);
  try {
    Object.defineProperty(window, "localStorage", {
      value: fake,
      configurable: true,
      writable: false,
    });
    return;
  } catch {
    // 브라우저가 교체를 막으면 프로토타입 쪽에서 막는다. 이것도 이 프레임에만 걸린다.
  }
  try {
    Storage.prototype.getItem = function getItem(k: string) {
      return fake.getItem(k);
    };
    Storage.prototype.setItem = function setItem(k: string, v: string) {
      fake.setItem(k, v);
    };
    Storage.prototype.removeItem = function removeItem(k: string) {
      fake.removeItem(k);
    };
  } catch {
    // 여기까지 막히면 저장소는 손대지 못한다. 화면은 그래도 뜬다 —
    // 세션은 `startSession()`이 메모리로 넣기 때문이다.
    console.warn("[showcase] 저장소를 격리하지 못했습니다.");
  }
}

// ── 2. 응답 만들기 ────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** 이 주소가 백엔드로 가는 것인가. 지도 타일·글꼴 같은 바깥 주소는 그대로 통과시킨다. */
function isBackend(url: string): boolean {
  try {
    const target = new URL(url, window.location.href);
    if (target.origin === new URL(API_BASE, window.location.href).origin) return true;
    // 상대경로로 부른 경우. 개발 서버에서 프록시를 쓰면 이 모양이 된다.
    return target.origin === window.location.origin && target.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

/** `GET` 응답 표. 경로만 보고 고른다. */
function handleGet(path: string): Response {
  if (path === "/api/tasks") return json({ ...RESTORE, completed });
  if (path === "/api/me") return json(ME);
  if (path === "/api/visits") return json(visits);
  if (path === "/api/chat-rooms") return json(CHAT_ROOMS);
  if (path.startsWith("/api/chat/")) {
    const routeId = decodeURIComponent(path.slice("/api/chat/".length));
    return json(CHAT_HISTORY[routeId] ?? []);
  }
  if (path === "/api/centers") return json(CENTERS);
  if (path === "/api/institutions") return json(INSTITUTIONS);
  if (path === "/api/district-offices") return json(DISTRICT_OFFICES);

  // 담당자 화면 (§8).
  if (path === "/api/staff/me") return json(STAFF_ME);
  if (path === "/api/staff/visits") return json(staffVisits);

  console.warn(`[showcase] 표에 없는 GET입니다: ${path}`);
  return json({});
}

/**
 * 쓰기 요청. **네트워크로 내보내지 않고 성공한 척한다.**
 *
 * 완료 체크나 방문 요청처럼 화면이 결과를 다시 그리는 것들은 프레임 안의 상태를
 * 실제로 고쳐서 돌려준다. 그래야 시연 중에 눌러 볼 수 있다.
 */
async function handleWrite(method: string, path: string, body: unknown): Promise<Response> {
  if (method === "PUT" && path === "/api/tasks/completed") {
    const next = (body as { completed?: string[] } | null)?.completed;
    if (Array.isArray(next)) completed = [...next];
    return json({ ...RESTORE, completed });
  }
  if (method === "PUT" && path === "/api/tasks") {
    // 상황을 다시 알아보면 끝낸 표시가 지워진다 (§3.7).
    completed = [];
    return json({ ...RESTORE, completed });
  }
  if (method === "POST" && path === "/api/signup") {
    return json({ user_id: "showcase-user", session_token: "showcase-demo-token", tasks: TASKS });
  }
  if (method === "POST" && path === "/api/intake/analyze") {
    return json({ tasks: TASKS });
  }
  if (method === "PATCH" && path === "/api/me") {
    return json({ ...ME, ...(body as object) });
  }
  if (method === "DELETE" && path === "/api/me") {
    return new Response(null, { status: 204 });
  }
  if (method === "POST" && path === "/api/visits") {
    const req = (body ?? {}) as { route_id?: string; preferred_at_1?: string; note?: string };
    const created = {
      id: `v-showcase-${Date.now()}`,
      route_id: req.route_id ?? "R2",
      status: "sent" as const,
      preferred_at_1: req.preferred_at_1 ?? new Date().toISOString(),
      preferred_at_2: null,
      prepared_docs: [],
      note: req.note ?? "",
      staff_name: "",
      meeting_place: "",
      confirmed_for: null,
      confirmed_at: null,
      created_at: new Date().toISOString(),
      proposed_at: null,
      cancel_reason: "",
      chat_available: false,
      unread: 0,
      last_message: "",
      last_message_at: null,
    };
    visits = [created, ...visits];
    return json(created);
  }
  if (method === "POST" && path.startsWith("/api/visits/") && path.endsWith("/cancel")) {
    const id = decodeURIComponent(path.slice("/api/visits/".length, -"/cancel".length));
    visits = visits.map((v) =>
      v.id === id ? { ...v, status: "cancelled" as const, cancel_reason: "본인이 취소했어요." } : v,
    );
    return json(visits.find((v) => v.id === id) ?? {});
  }
  if (method === "DELETE" && path.startsWith("/api/chat/")) {
    return new Response(null, { status: 204 });
  }
  if (method === "POST" && path === "/api/staff/login") {
    // **무엇을 넣어도 들어간다.** 실제 자격을 확인할 서버가 없고, 확인할 이유도 없다 —
    // 이 프레임에서 보이는 것은 전부 가상 데이터다.
    return json(STAFF_LOGIN);
  }
  if (method === "PATCH" && path.startsWith("/api/staff/visits/")) {
    const id = decodeURIComponent(path.slice("/api/staff/visits/".length));
    const action = (body ?? {}) as { status?: string; meeting_place?: string };
    staffVisits = staffVisits.map((v) =>
      v.id === id
        ? {
            ...v,
            status: (action.status as StaffVisitResponse["status"]) ?? v.status,
            meeting_place: action.meeting_place ?? v.meeting_place,
          }
        : v,
    );
    return json(staffVisits.find((v) => v.id === id) ?? {});
  }
  if (method === "POST" && path === "/api/staff/logout") {
    return new Response(null, { status: 204 });
  }

  console.warn(`[showcase] 표에 없는 ${method}입니다: ${path} — 보내지 않고 성공으로 돌려줍니다.`);
  return json({});
}

// ── 3. 상담 스트림 ────────────────────────────────────────────────────

/** SSE 프레임 한 개를 전송 형식(`event:` + `data:` + 빈 줄)으로 만든다. */
function encodeFrame({ event, data }: SseFrame): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * 대본을 한 프레임씩 흘려보내는 스트림.
 *
 * **한 번에 다 보내지 않는다.** `streamChat`이 `res.body.getReader()`로 읽고 있어서,
 * 간격을 두면 글자가 실제로 흐르는 장면을 캡처할 수 있다.
 */
function chatStream(): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= CHAT_STREAM.length) {
        controller.close();
        return;
      }
      const frame = CHAT_STREAM[index++];
      return new Promise<void>((resolve) => {
        // 글자 델타는 빠르게, 카드나 근거처럼 무게가 있는 프레임은 조금 쉬어 간다.
        const wait = frame.event === "text" ? 45 : 220;
        setTimeout(() => {
          controller.enqueue(encoder.encode(encodeFrame(frame)));
          resolve();
        }, wait);
      });
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

// ── 4. fetch 교체 ─────────────────────────────────────────────────────

function installFetch(): void {
  const original = window.fetch.bind(window);

  window.fetch = async function showcaseFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (!isBackend(url)) return original(input as RequestInfo, init);

    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const path = new URL(url, window.location.href).pathname;

    if (method === "POST" && path === "/api/chat") return chatStream();
    if (method === "GET" || method === "HEAD") return handleGet(path);

    let body: unknown = null;
    try {
      const raw = init?.body ?? (input instanceof Request ? await input.text() : null);
      if (typeof raw === "string" && raw) body = JSON.parse(raw);
    } catch {
      // 본문이 JSON이 아니면 그냥 없는 것으로 다룬다.
    }
    return handleWrite(method, path, body);
  } as typeof window.fetch;
}

// ── 5. 소켓 ─────────────────────────────────────────────
//
// `useVisitChat`은 `socket.io-client`로 붙는다. 그냥 막으면 담당자와 나누는 대화가
// **빈 방**으로 뜨므로, 막는 대신 가짜 서버를 둔다 (`fakeSocket.ts`).
//
// 어느 방의 대화를 줄까. 출소자 화면은 `VISITS`의 id로, 담당자 화면은 `sv-*`로
// 들어온다. 표에 없는 방은 빈 배열이며 그것이 정상이다 — 아직 아무 말도 오가지 않은 방이다.

function installSocket(): void {
  installFakeSocketIo(isBackend, (visitId) => ROOM_MESSAGES[visitId] ?? []);
}

// ── 6. 위치 차단 ──────────────────────────────────────────────────────
//
// **시연 프레임이 보는 사람의 실제 위치를 읽으면 안 된다.** 두 가지 이유가 겹친다.
//   - 캡처가 찍는 기계마다 달라진다. 실제로 배포본에서 지도 머리글이 픽스처의
//     안양이 아니라 그 기계가 있는 지역으로 떴다
//   - PPT를 만드는 사람의 위치가 시연 이미지에 박힐 이유가 없다
//
// 막으면 `useRegionLookup`이 "거부됨"으로 보고 기기에 남은 곳(우리가 심은 값)으로
// 물러선다. 그 길은 위치를 거부한 사용자를 위해 이미 있는 길이다 (§5.4).

function installNoGeolocation(): void {
  const denied = { code: 1, message: "showcase: 위치를 쓰지 않습니다.", PERMISSION_DENIED: 1 };

  try {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: unknown, fail?: (e: unknown) => void) => fail?.(denied),
        watchPosition: (_ok: unknown, fail?: (e: unknown) => void) => {
          fail?.(denied);
          return 0;
        },
        clearWatch: () => {},
      },
    });
  } catch {
    // 못 바꿔도 아래 권한 조회가 막아 준다.
  }

  try {
    const originalQuery = navigator.permissions?.query?.bind(navigator.permissions);
    if (originalQuery) {
      navigator.permissions.query = ((desc: { name: string }) => {
        if (desc?.name === "geolocation") {
          return Promise.resolve({
            state: "denied",
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          } as unknown as PermissionStatus);
        }
        return originalQuery(desc as PermissionDescriptor);
      }) as typeof navigator.permissions.query;
    }
  } catch {
    // 이 브라우저가 권한 조회를 안 주면 위의 차단만으로 충분하다.
  }
}

// ── 7. 애니메이션 정지 ────────────────────────────────────────────────

function installReducedMotion(): void {
  const style = document.createElement("style");
  style.textContent = `*, *::before, *::after {
    animation-duration: .001ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
    transition-delay: 0ms !important;
    scroll-behavior: auto !important;
  }`;
  document.head.appendChild(style);

  // CSS만으로는 JS가 직접 값을 바꾸는 애니메이션이 남는다. 라이브러리들이 이 질의를
  // 보고 스스로 멈추는 경우가 있어 함께 참으로 돌려준다.
  const originalMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = function patched(query: string): MediaQueryList {
    const result = originalMatchMedia(query);
    if (!query.includes("prefers-reduced-motion")) return result;
    return new Proxy(result, {
      get(target, prop, receiver) {
        if (prop === "matches") return !query.includes("no-preference");
        const value = Reflect.get(target, prop, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };
}

// ── 설치 ──────────────────────────────────────────────────────────────

/**
 * 목업을 켠다. **경로를 확인한 쪽에서 부른다** — 이 함수는 자기가 어디서 불렸는지
 * 판단하지 않는다.
 */
export function installShowcaseMocks(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // **시연 중임을 전역에 남긴다.** 지금 이 앱에는 애널리틱스도 오류 수집기도 없다.
  // 나중에 붙일 때 이 값을 보고 초기화를 건너뛰면, 시연 프레임에서 찍힌 화면 이동과
  // 가짜 데이터가 실제 지표에 섞이지 않는다.
  (window as unknown as { __MAJUNG_SHOWCASE__?: boolean }).__MAJUNG_SHOWCASE__ = true;

  installStorage();
  installFetch();
  installSocket();
  installNoGeolocation();
  installReducedMotion();

  // **화면들이 세션을 메모리에서 읽는다.** 이것이 없으면 전부 `/signup`으로 튕긴다.
  startSession({ ...SESSION, tasks: [...SESSION.tasks], completed: [...SESSION.completed] });
}
