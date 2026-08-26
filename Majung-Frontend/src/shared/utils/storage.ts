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

/** 마지막으로 알아낸 지역. 없으면 `null`. */
export function lastPlace(): { sido: string; district: string; dong: string } | null {
  if (!hasLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(PLACE_KEY);
    if (!raw) return null;
    const found = JSON.parse(raw) as { sido?: string; district?: string; dong?: string };
    // **셋이 다 있어야 쓸모가 있다.** 시도만 남으면 기관 조회가 전국을 훑는다.
    if (!found.sido || !found.district) return null;
    return { sido: found.sido, district: found.district, dong: found.dong ?? "" };
  } catch {
    // 남의 값이 들어 있거나 형식이 깨졌으면 없는 것으로 친다.
    return null;
  }
}

export function markPlace(place: { sido: string; district: string; dong: string }): void {
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
  } catch {
    // no-op
  }
}
