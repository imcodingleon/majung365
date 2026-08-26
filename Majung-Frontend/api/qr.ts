// QR 코드가 가리키는 한 자리 (§2.2·§2.3).
//
// **목적지를 코드에 박지 않는다.** 스토어 링크는 아직 없고, 나오면 그때 바꿔야 하는데
// QR은 그 전에 이미 인쇄물이나 안내판에 실려 나간 뒤일 수 있다. 종이를 다시 찍을 수는
// 없으므로 **주소는 그대로 두고 목적지만 바꾼다.** Vercel Edge Config에서 읽으므로
// 대시보드에서 값만 고치면 재배포 없이 다음 요청부터 반영된다.
//
// 기기별로 갈라 보내는 자리도 미리 두었다. 한쪽 스토어만 먼저 열려도 나머지가 깨지지
// 않게, 기기별 값이 비어 있으면 공통값으로 되돌아간다.
//
// **이 파일은 Expo 앱 코드가 아니다.** Vercel이 `api/` 아래를 함수로 만든다.
// Metro는 `src/app/`에서만 훑으므로 앱 번들에는 들어가지 않는다.
import { get } from "@vercel/edge-config";

// 리다이렉트는 판단이 가볍고 응답이 빨라야 하므로 엣지에서 돈다.
export const config = { runtime: "edge" };

/** 기기를 가리지 않는 공통 목적지. 기기별 값이 없으면 여기로 보낸다. */
const KEY_DEFAULT = "qr_redirect_target";
const KEY_IOS = "qr_redirect_ios";
const KEY_ANDROID = "qr_redirect_android";

/**
 * 세 값을 모두 읽지 못했을 때 갈 곳.
 *
 * **QR은 죽으면 안 된다.** 인쇄물에 실려 나간 뒤에는 고칠 수 없고, 시연 도중에
 * 빈 화면이 뜨는 것이 가장 나쁘다. Edge Config가 끊기거나 아직 연결되지 않았어도
 * 최소한 웹사이트로는 보낸다.
 */
const LAST_RESORT = "https://majung365.vercel.app";

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
async function readTarget(key: string): Promise<string | null> {
  let value: unknown;
  try {
    value = await get(key);
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

export default async function handler(request: Request): Promise<Response> {
  const userAgent = request.headers.get("user-agent") ?? "";
  const key = deviceKey(userAgent);

  // 기기별 값과 공통값을 함께 읽는다. 순서대로 읽으면 기기별 값이 비었을 때
  // 왕복이 한 번 더 생기고, 그만큼 QR을 찍은 사람이 더 기다린다.
  const [deviceTarget, defaultTarget] = await Promise.all([
    key ? readTarget(key) : Promise.resolve(null),
    readTarget(KEY_DEFAULT),
  ]);

  const target = deviceTarget ?? defaultTarget ?? LAST_RESORT;

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      // **캐시하면 안 된다.** 캐시가 남으면 대시보드에서 값을 고쳐도 한동안
      // 옛 목적지로 보내는데, 그것이 이 함수를 만든 이유를 그대로 무너뜨린다.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
