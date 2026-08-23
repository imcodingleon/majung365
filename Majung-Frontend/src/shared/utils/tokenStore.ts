// 세션 토큰 보관 (§2.4 · CLAUDE.md 규칙 6).
//
// **iOS Keychain·Android Keystore에 둔다.** `AsyncStorage`나 `localStorage`에 평문으로
// 두지 않는다 — 기기를 잡은 사람이 그대로 읽는다. 출소자 대상 서비스에서 이 토큰은
// "이 사람이 출소자다"라는 사실로 가는 열쇠다.
//
// **웹에서는 저장하지 않는다.** `expo-secure-store`가 웹을 지원하지 않고, 대신 쓸 수 있는
// 것은 `localStorage`뿐인데 그것은 평문이다. 웹은 심사·시연 용도이므로(§2.6) 새로고침하면
// 다시 가입 화면으로 가는 편이 안전하다. **없는 것이 평문보다 낫다.**
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY = "majung.session";

/** 이번에 앱을 켜 있는 동안의 값. 웹에서는 이것만 쓴다. */
let memory: string | null = null;

const canPersist = Platform.OS !== "web";

export async function saveToken(token: string): Promise<void> {
  memory = token;
  if (!canPersist) return;
  try {
    await SecureStore.setItemAsync(KEY, token);
  } catch {
    // 기기가 보안 저장소를 못 쓰는 경우가 있다(잠금 설정 없음 등).
    // 그때는 메모리에만 두고 앱을 닫으면 사라진다 — 저장 실패로 앱을 멈추지 않는다.
  }
}

export async function loadToken(): Promise<string | null> {
  if (memory) return memory;
  if (!canPersist) return null;
  try {
    memory = await SecureStore.getItemAsync(KEY);
    return memory;
  } catch {
    return null;
  }
}

/** 로그아웃·삭제. **지운 뒤에 남는 것이 없어야 한다** (§9.4). */
export async function clearToken(): Promise<void> {
  memory = null;
  if (!canPersist) return;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // 이미 없으면 그것도 지워진 상태다.
  }
}
