// 앱을 검증 가능한 상태로 띄우는 도우미.
//
// 하는 일은 셋이다.
//   1. 브라우저의 시계를 `NOW`로 못 박는다 — 날짜 표시를 결정적으로 만든다
//   2. 세션 토큰을 심어 가입한 사람으로 들어간다
//   3. 서버 응답을 가짜로 채운다
//
// **가로채지 않은 API도 실제 서버로 내보내지 않는다.** 하나라도 새어 나가면 배포
// 서버의 응답 속도에 따라 결과가 흔들리고, 테스트를 돌릴 때마다 그쪽에 자국이 남는다.
import type { Page, Route } from "@playwright/test";

import { BIRTH, NOW, roomsFixture, tasksFixture, visitsFixture } from "./fixtures";

/** `src/shared/utils/tokenStore.ts`가 쓰는 키. 웹에서는 `localStorage`에 둔다. */
const TOKEN_KEY = "majung.session";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
} as const;

export type Mocks = {
  /** `GET /api/tasks`. `null`을 주면 세션이 되살아나지 않아 가입 화면으로 간다. */
  tasks?: ReturnType<typeof tasksFixture> | null;
  visits?: unknown[];
  chatRooms?: unknown[];
  /** `GET /api/chat/{routeId}` — 그 방의 지난 대화. */
  chatHistory?: unknown[];
  /** AI가 흘려보낼 답 조각. */
  chatDeltas?: string[];
  /**
   * `card` 프레임으로 흘려보낼 제도 카드. 카드는 답변에 붙고 말풍선을 따로 세우지
   * 않으므로, 이것이 없으면 접히는 안내 자리가 아예 생기지 않는다.
   */
  chatCards?: Record<string, unknown>[];
  /** 답을 주기까지 끄는 시간(ms). 로딩 표시를 확인할 때 쓴다. */
  chatDelayMs?: number;
  /**
   * `suggestions` 프레임으로 흘려보낼 다음 질문 (§6.1).
   *
   * **주지 않으면 프레임 자체를 안 보낸다.** 빈 배열과 다르다 — 서버 계약이
   * "못 만들었으면 이벤트를 보내지 않는다"이므로 그 경로를 그대로 흉내낸다.
   *
   * **배열의 배열을 주면 회차마다 갈린다.** 두 번 주고받으며 앞의 제안이 새것으로
   * 바뀌는지 보려면 회차가 갈려야 한다. 하나짜리 배열은 매번 같은 것을 준다.
   */
  chatSuggestions?: string[] | string[][];
  /**
   * 할 일마다 다른 첫 질문 (§6.1).
   *
   * **기본은 주지 않는 것이다.** `tasksFixture`에 넣어 버리면 기본 문구로
   * 물러서는 경로를 보는 기존 검증이 함께 깨진다.
   */
  starterQuestions?: Record<string, string[]>;
  /** `GET /api/centers` — 지도에 찍고 목록에 낼 기관. 비면 "조건에 맞는 센터가 없어요"다. */
  centers?: unknown[];
  /** `GET /api/me`를 실패시킨다. 내 정보를 못 불러온 사람이 갇히지 않는지 볼 때 쓴다. */
  meFails?: boolean;
  /** 토큰을 심을지. 거짓이면 가입 안 한 사람으로 들어간다. */
  signedIn?: boolean;
  /**
   * 시계를 `NOW`로 못 박을지. 기본은 참이다.
   *
   * **애니메이션이 있는 화면에서는 꺼야 한다.** React Native의 `Animated`는 흐른
   * 시간을 `Date.now()`로 재는데, 그 값이 멈춰 있으면 진행도가 영원히 0이다. 실제로
   * 날짜 고르기 시트가 화면 밖에 머물러, 덮개만 깔린 채 아무것도 누를 수 없었다.
   */
  freezeClock?: boolean;
};

function json(route: Route, data: unknown) {
  return route.fulfill({
    status: 200,
    headers: { ...CORS, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
}

/** SSE 한 프레임. 앱은 빈 줄로 프레임을 가른다. */
function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** 회차마다 다른 제안을 주려고 배열의 배열을 편다. 없으면 빈 목록이다. */
function suggestionRounds(mocks: Mocks): string[][] {
  const given = mocks.chatSuggestions;
  if (!given) return [];
  return Array.isArray(given[0]) ? (given as string[][]) : [given as string[]];
}

async function installApi(page: Page, mocks: Mocks): Promise<void> {
  const base = mocks.tasks === undefined ? tasksFixture() : mocks.tasks;
  // 할 일마다 다른 첫 질문. 주지 않으면 필드가 아예 없어 화면이 기본 문구로 물러선다.
  const tasks =
    base && mocks.starterQuestions
      ? {
          ...base,
          tasks: base.tasks.map((t) => ({
            ...t,
            starter_questions: mocks.starterQuestions?.[t.route_id],
          })),
        }
      : base;
  const rounds = suggestionRounds(mocks);
  // 같은 방에 두 번 물었을 때 회차를 가른다.
  let turn = 0;
  const visits = mocks.visits ?? [];
  const rooms = mocks.chatRooms ?? [];
  const history = mocks.chatHistory ?? [];

  await page.route(/\/api\//, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: CORS });
    }

    const path = new URL(request.url()).pathname;

    if (path === "/api/tasks") {
      // 토큰은 있는데 세션이 없는 상태를 만들 때 쓴다. 401이면 앱이 가입으로 보낸다.
      if (tasks === null) {
        return route.fulfill({ status: 401, headers: CORS, body: "{}" });
      }
      return json(route, tasks);
    }
    if (path === "/api/visits") {
      // 방문 예약을 보내는 것도 여기서 받는다. 서버에 자국을 남기지 않는다.
      //
      // **보낸 값을 그대로 되돌려 준다.** 아무 값이나 주면 화면이 그 요청을 자기
      // 할 일과 짝지어 주지 못해, 보내고 나서 아무 변화도 없는 것처럼 보인다.
      if (request.method() === "POST") {
        const sent = (request.postDataJSON() ?? {}) as {
          route_id?: string;
          preferred_at_1?: string;
          prepared_docs?: string[];
          note?: string;
        };
        return json(route, {
          id: "v-new",
          route_id: sent.route_id ?? "",
          status: "sent",
          preferred_at_1: sent.preferred_at_1 ?? "",
          preferred_at_2: null,
          prepared_docs: sent.prepared_docs ?? [],
          note: sent.note ?? "",
          staff_name: "",
          meeting_place: "",
          confirmed_for: null,
          confirmed_at: null,
          created_at: NOW.toISOString(),
          proposed_at: null,
          cancel_reason: "",
          chat_available: false,
          unread: 0,
          last_message: "",
          last_message_at: null,
        });
      }
      return json(route, visits);
    }
    if (path === "/api/centers") return json(route, mocks.centers ?? []);
    if (path === "/api/chat-rooms") return json(route, rooms);
    if (path.startsWith("/api/chat/")) return json(route, history);

    if (path === "/api/chat" && request.method() === "POST") {
      // **일부러 늦춘다.** 곧바로 답하면 "답을 찾고 있어요" 말풍선이 뜰 겨를이 없다.
      if (mocks.chatDelayMs) {
        await new Promise((done) => setTimeout(done, mocks.chatDelayMs));
      }
      const deltas = mocks.chatDeltas ?? ["안내해 드릴게요. ", "교정시설에서 받으실 수 있어요."];
      // 회차마다 갈린다. 회차가 모자라면 마지막 것을 되풀이한다.
      const suggested = rounds.length > 0 ? rounds[Math.min(turn, rounds.length - 1)] : null;
      turn += 1;
      // 서버 계약대로 카드는 본문 뒤, 추천 질문은 카드 뒤 done 앞이다.
      const body =
        deltas.map((delta) => frame("text", { delta })).join("") +
        (mocks.chatCards ?? []).map((card) => frame("card", card)).join("") +
        (suggested ? frame("suggestions", { questions: suggested }) : "") +
        frame("done", {});
      return route.fulfill({
        status: 200,
        headers: { ...CORS, "content-type": "text/event-stream" },
        body,
      });
    }

    if (path === "/api/me") {
      // **못 불러오는 경우를 만들 수 있어야 한다.** 그때 화면이 맞는 생일까지 틀렸다고
      // 하던 결함이 있었다.
      if (mocks.meFails) {
        return route.fulfill({
          status: 500,
          headers: CORS,
          body: JSON.stringify({ detail: "내 정보를 불러오지 못했어요." }),
        });
      }
      // 생일 확인 화면을 지나려면 저장된 값이 있어야 한다. `BIRTH`가 그 값이다.
      return json(route, {
        user_id: "e2e",
        name: tasks?.name ?? "",
        birth_date: BIRTH,
        release_date: "2026-08-30",
        days_since_release: 1,
        // **서버가 주는 이름 그대로다.** `has_crime`으로 적어 두었던 때는 화면이 읽는
        // `has_crime_category`가 늘 비어, 죄목을 밝힌 사람도 안 밝힌 것으로 보였다.
        has_crime_category: true,
      });
    }

    // 근처 기관처럼 화면에 덧붙는 것들. 빈 목록이면 그 구역만 안 그려진다.
    return json(route, []);
  });
}

/**
 * 앱을 열고 화면이 뜰 때까지 기다린다.
 *
 * 세션을 되살리는 동안 앱이 회전 표시만 그리므로, 그것이 사라진 뒤를 봐야 한다.
 */
export async function openApp(page: Page, path: string, mocks: Mocks = {}): Promise<void> {
  // 시계 고정은 페이지가 뜨기 전에 걸어야 한다.
  if (mocks.freezeClock !== false) {
    await page.clock.setFixedTime(NOW);
  }

  if (mocks.signedIn !== false) {
    await page.addInitScript(
      ([key, token]) => {
        try {
          window.localStorage.setItem(key, token);
        } catch {
          // 저장이 막혀 있으면 그대로 둔다. 그 경우는 이 테스트가 볼 자리가 아니다.
        }
      },
      [TOKEN_KEY, "e2e-token"] as const,
    );
  }

  await installApi(page, mocks);
  // **`load`를 기다리지 않는다.** 개발 서버가 번들을 다시 말고 있으면 그 이벤트가
  // 한참 뒤에 오는데, 화면은 이미 그려져 있다. 어느 화면이 떴는지는 각 검증이
  // `expect`로 붙잡으므로 여기서는 문서만 서면 넘어간다.
  await page.goto(path, { waitUntil: "domcontentloaded" });
}
