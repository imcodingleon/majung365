// QR 코드가 가리키는 한 자리 (§2.2·§2.3).
//
// **목적지를 코드에 박지 않는다.** 스토어 링크는 아직 없고, 나오면 그때 바꿔야 하는데
// QR은 그 전에 이미 인쇄물이나 안내판에 실려 나간 뒤일 수 있다. 종이를 다시 찍을 수는
// 없으므로 **주소는 그대로 두고 목적지만 바꾼다.** Vercel Edge Config에서 읽으므로
// 대시보드에서 값만 고치면 재배포 없이 다음 요청부터 반영된다.
//
// **레포 루트에 있어야 한다.** 이 프로젝트의 Vercel 설정은 루트 `vercel.json`이고
// (`Majung-Frontend/vercel.json`은 읽히지 않는다), Vercel은 그 루트의 `api/`를 함수로
// 만든다. 앱 폴더 안에 두면 조용히 무시되어 404가 난다 — 실제로 한 번 그랬다.
//
// **SDK(`@vercel/edge-config`)를 쓰지 않고 직접 부른다.** 빌드가 `cd Majung-Frontend`
// 안에서만 `npm install`을 돌려 레포 루트에는 `node_modules`가 없다. SDK를 쓰려면
// 설치 흐름을 통째로 바꿔야 하는데, 읽는 것이 값 하나라 그럴 이유가 없다.

/** 기기를 가리지 않는 공통 목적지. 기기별 값이 없으면 여기로 보낸다. */
const KEY_DEFAULT = "qr_redirect_target";
const KEY_IOS = "qr_redirect_ios";
const KEY_ANDROID = "qr_redirect_android";

/**
 * 아무 값도 읽지 못했을 때 갈 곳.
 *
 * **QR은 죽으면 안 된다.** 인쇄물에 실려 나간 뒤에는 고칠 수 없고, 시연 도중에 빈
 * 화면이 뜨는 것이 가장 나쁘다. Edge Config가 끊기거나 아직 연결되지 않았어도
 * 최소한 웹사이트로는 보낸다.
 */
const LAST_RESORT = "https://majung365.vercel.app";

/** Edge Config 연결 문자열을 조각내 둔 것. 요청마다 다시 뜯지 않는다. */
type Connection = { baseUrl: string; token: string };

/**
 * `EDGE_CONFIG` 환경변수를 읽는다. 대시보드에서 Edge Config를 프로젝트에 연결하면
 * Vercel이 이 이름으로 넣어 준다.
 *
 * 꼴은 `https://edge-config.vercel.com/ecfg_xxx?token=yyy` 이다.
 */
function connection(): Connection | null {
  const raw = process.env.EDGE_CONFIG;
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const id = url.pathname.split("/")[1];
    const token = url.searchParams.get("token");
    if (!id || !token) return null;
    return { baseUrl: `https://edge-config.vercel.com/${id}`, token };
  } catch {
    console.error("[qr] EDGE_CONFIG가 주소 꼴이 아니다");
    return null;
  }
}

/** 스캔한 기기에 맞는 키. 가릴 수 없으면 null이고 공통값을 쓴다. */
function deviceKey(userAgent: string): string | null {
  // iPadOS 13부터 아이패드가 자기를 Macintosh라고 말한다. QR은 폰 카메라로 찍는
  // 것이 대부분이라 그대로 두고, 갈리지 않으면 공통값으로 간다.
  if (/iPhone|iPad|iPod/i.test(userAgent)) return KEY_IOS;
  if (/Android/i.test(userAgent)) return KEY_ANDROID;
  return null;
}

/**
 * Edge Config에서 목적지 하나를 읽는다. 쓸 수 없는 값이면 null을 낸다.
 *
 * **주소인지 확인하고 넘긴다.** 대시보드에서 사람이 손으로 고치는 값이라 오타가
 * 들어올 수 있는데, 검사 없이 `Location`에 실으면 브라우저가 엉뚱한 곳으로 가거나
 * 아무 데도 못 간다.
 */
async function readTarget(conn: Connection, key: string): Promise<string | null> {
  let value: unknown;
  try {
    const res = await fetch(`${conn.baseUrl}/item/${key}?version=1`, {
      headers: { Authorization: `Bearer ${conn.token}` },
      cache: "no-store",
    });
    // 키가 아직 없으면 404가 온다. 잘못이 아니라 "비어 있다"는 뜻이다.
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`[qr] ${key}를 읽지 못했다: HTTP ${res.status}`);
      return null;
    }
    value = await res.json();
  } catch (error) {
    // 값 자체는 비밀이 아니지만 무엇이 끊겼는지는 남겨야 고칠 수 있다.
    console.error(`[qr] Edge Config에서 ${key}를 읽지 못했다`, error);
    return null;
  }

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    console.error(`[qr] ${key}의 값이 주소 꼴이 아니다: ${trimmed}`);
    return null;
  }
}

async function pickTarget(userAgent: string): Promise<string> {
  const conn = connection();
  if (!conn) {
    console.error("[qr] EDGE_CONFIG가 없다 — 연결이 빠졌거나 재배포가 필요하다");
    return LAST_RESORT;
  }

  const key = deviceKey(userAgent);

  // 기기별 값과 공통값을 함께 읽는다. 순서대로 읽으면 기기별 값이 비었을 때
  // 왕복이 한 번 더 생기고, 그만큼 QR을 찍은 사람이 더 기다린다.
  const [deviceTarget, defaultTarget] = await Promise.all([
    key ? readTarget(conn, key) : Promise.resolve(null),
    readTarget(conn, KEY_DEFAULT),
  ]);

  return deviceTarget ?? defaultTarget ?? LAST_RESORT;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const target = await pickTarget(request.headers.get("user-agent") ?? "");

    return new Response(null, {
      status: 302,
      headers: {
        Location: target,
        // **캐시하면 안 된다.** 캐시가 남으면 대시보드에서 값을 고쳐도 한동안
        // 옛 목적지로 보내는데, 그것이 이 함수를 만든 이유를 그대로 무너뜨린다.
        "Cache-Control": "no-store, max-age=0",
      },
    });
  },
};
