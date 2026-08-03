// 온보딩 결과("오늘의 과제") 로컬 저장 — 로그인 없는 서비스라 기기(브라우저)당 1회 판별용.
// 예선은 웹 export 전제라 localStorage만 사용. 네이티브에선 window가 없어 조용히 no-op.
// 비즈니스 로직 없음 — 읽기/쓰기/삭제만.
import type { TaskCard } from "../types";

const KEY = "majung365.onboarding.task";

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** 저장된 "오늘의 과제"를 읽는다. 없거나(첫 방문) 파싱 실패면 null. */
export function getOnboardingResult(): TaskCard | null {
  if (!hasLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TaskCard) : null;
  } catch {
    return null;
  }
}

/** 온보딩 완료 시 결과를 저장한다(=완료 플래그를 겸함). */
export function saveOnboardingResult(task: TaskCard): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(task));
  } catch {
    // 저장 실패해도 화면 흐름은 막지 않는다(예: 프라이빗 모드 용량 제한)
  }
}

/** "상황 다시 체크하기" — 저장된 결과를 지워 다음 방문에 온보딩부터 시작하게 한다. */
export function clearOnboardingResult(): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
