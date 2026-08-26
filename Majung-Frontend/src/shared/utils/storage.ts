// 기기에 남기는 최소한의 값. 개인정보는 여기 넣지 않는다.
//
// 지금 담는 것은 가입을 마쳤는지 여부 하나뿐이다. 이름·생일·출소날짜 같은 값은 서버가
// 암호화해 보관하고(§9.1), **자동 로그인 토큰은 OS 보안 저장소(expo-secure-store)에 넣는다**
// (§2.4). localStorage에 평문으로 두지 않는다.
//
// 웹은 심사·시연 용도라 보안 저장소를 쓸 수 없고 자동 로그인도 지원하지 않는다 (§2.6).

const SIGNED_UP_KEY = "majung365.signedUp";
/**
 * 알림을 마지막으로 본 시각(ISO).
 *
 * **서버에 두지 않는다.** 알림 읽음 상태를 서버에 쌓으면 "누가 언제 어느 기관과
 * 연락했는가"가 한 줄씩 남는다 (`decision-log-2026-08-26.md` A-3).
 *
 * 감수하는 것: 기기를 바꾸면 따라오지 않아 알림이 다시 안 읽은 것으로 보인다.
 */
const ALERTS_SEEN_KEY = "majung365.alertsSeen";
/**
 * 마지막으로 알아낸 지역 (시도·시군구·동).
 *
 * **서버에 두지 않는다.** "누가 어디 사는지"가 보관·파기 대상(§9.4)으로 늘어난다.
 * 좌표는 여기에도 담지 않는다 — 기기에서 행정동으로 바꾼 뒤 바로 버린다(§5.4).
 *
 * 저장하지 않았을 때는 **새로고침할 때마다 위치를 다시 잡아야 했다.** 심사·시연을
 * 웹으로 하는데(§2.6) 그것은 기능이 없는 것과 같았다. 토큰을 웹 `localStorage`에
 * 두기로 한 결정(2026-08-24)과 같은 판단이다.
 */
const PLACE_KEY = "majung365.place";
/**
 * 초기 진단 답변 원문 (문항 id 기준).
 *
 * **서버에 두지 않는다.** 서버가 보관하는 것은 판정뿐이고(§9.1), 답변 원문은 여기까지가
 * 끝이다. 이 규칙은 그대로 지킨다.
 *
 * **기기에는 남긴다** (2026-08-26 결정 G-1). 예전에는 메모리에만 두어서, 새로고침하면
 * 방문 알림의 "담당자에게 이만큼 알려주기"(§7.4-1) 화면이 통째로 사라졌다. 어느 문항의
 * 답인지 알아야 문장을 만들 수 있는데 그 답이 없어졌기 때문이다.
 *
 * 감수하는 것: 공용 PC에서 브라우저를 닫아도 답변이 남는다. 다만 같은 저장소에 이미
 * 토큰이 있고(2026-08-24 결정) 그것은 대화까지 열 수 있는 값이라, 여기서 늘어나는
 * 노출은 그 안쪽이다.
 */
const ANSWERS_KEY = "majung365.answers";

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** 가입을 마쳤는지. 앱을 켰을 때 가입 화면으로 갈지 홈으로 갈지를 이 값으로 정한다. */
export function isSignedUp(): boolean {
  if (!hasLocalStorage()) return false;
  try {
    return window.localStorage.getItem(SIGNED_UP_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSignedUp(): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(SIGNED_UP_KEY, "1");
  } catch {
    // 저장에 실패해도 화면 흐름은 막지 않는다(프라이빗 모드·용량 제한).
  }
}

/** 알림을 마지막으로 본 시각. 본 적이 없으면 `null`이다. */
export function lastAlertsSeen(): string | null {
  if (!hasLocalStorage()) return null;
  try {
    return window.localStorage.getItem(ALERTS_SEEN_KEY);
  } catch {
    return null;
  }
}

export function markAlertsSeen(at: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(ALERTS_SEEN_KEY, at);
  } catch {
    // 저장에 실패해도 화면 흐름은 막지 않는다(프라이빗 모드·용량 제한).
  }
}

/** 기기에 남기는 위치. 좌표는 위치로 알아낸 경우에만 있다. */
type StoredPlace = {
  sido: string;
  district: string;
  dong: string;
  lat?: number;
  lng?: number;
};

/**
 * 마지막으로 알아낸 지역. 없으면 `null`.
 *
 * **좌표까지 남긴다** (2026-08-26 결정 F-1). 새로고침하고 나서도 지도가 그 자리를
 * 기준으로 떠야 하는데, 시군구만 남기면 거리를 잴 기준이 사라져 동네 한가운데로
 * 되돌아간다.
 */
export function lastPlace(): StoredPlace | null {
  if (!hasLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(PLACE_KEY);
    if (!raw) return null;
    const found = JSON.parse(raw) as Partial<StoredPlace>;
    // **둘이 다 있어야 쓸모가 있다.** 시도만 남으면 기관 조회가 전국을 훑는다.
    if (!found.sido || !found.district) return null;
    return {
      sido: found.sido,
      district: found.district,
      dong: found.dong ?? "",
      // 좌표는 짝으로만 쓴다. 하나만 남아 있으면 없는 것으로 친다.
      ...(typeof found.lat === "number" && typeof found.lng === "number"
        ? { lat: found.lat, lng: found.lng }
        : {}),
    };
  } catch {
    // 남의 값이 들어 있거나 형식이 깨졌으면 없는 것으로 친다.
    return null;
  }
}

export function markPlace(place: StoredPlace): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(PLACE_KEY, JSON.stringify(place));
  } catch {
    // 저장에 실패해도 화면 흐름은 막지 않는다(프라이빗 모드·용량 제한).
  }
}

/**
 * 모든 정보를 지웠을 때. 다음에 앱을 켜면 가입 화면부터 시작한다 (§9.4).
 *
 * **여기 담는 키를 하나라도 빠뜨리면 안 된다.** 다 지웠는데 하나가 남으면 지운 것이
 * 아니다.
 */
export function clearSignedUp(): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(SIGNED_UP_KEY);
    window.localStorage.removeItem(ALERTS_SEEN_KEY);
    window.localStorage.removeItem(PLACE_KEY);
    window.localStorage.removeItem(ANSWERS_KEY);
  } catch {
    // no-op
  }
}

/**
 * 한 문항의 답. 단일선택은 문자열, 복수선택은 배열이다.
 *
 * **`features/intake`의 타입을 가져오지 않는다.** `shared`가 feature를 가져가면
 * 의존성이 거꾸로 흐른다. 모양만 같게 적어 두고 부르는 쪽에서 맞춘다.
 */
export type StoredAnswers = Record<string, string | readonly string[]>;

/** 지난번에 답한 초기 진단. 없으면 `null`. */
export function lastAnswers(): StoredAnswers | null {
  if (!hasLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(ANSWERS_KEY);
    if (!raw) return null;
    const found: unknown = JSON.parse(raw);
    if (!found || typeof found !== "object" || Array.isArray(found)) return null;
    // **값의 모양까지 본다.** 남의 값이나 옛 형식이 들어 있으면 문항을 되짚다가
    // 화면이 터진다. 문자열이나 문자열 배열이 아닌 것은 버린다.
    const clean: Record<string, string | readonly string[]> = {};
    for (const [id, value] of Object.entries(found as Record<string, unknown>)) {
      if (typeof value === "string") clean[id] = value;
      else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
        clean[id] = value as readonly string[];
      }
    }
    return Object.keys(clean).length > 0 ? clean : null;
  } catch {
    return null;
  }
}

/** 방금 답한 초기 진단을 남긴다. 다시 하기로 답을 바꾸면 통째로 덮어쓴다. */
export function markAnswers(answers: StoredAnswers): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(ANSWERS_KEY, JSON.stringify(answers));
  } catch {
    // 저장에 실패해도 화면 흐름은 막지 않는다(프라이빗 모드·용량 제한).
  }
}
