// 세션 토큰 보관 (§2.4 · CLAUDE.md 규칙 6).
//
// **iOS Keychain·Android Keystore에 둔다.** `AsyncStorage`나 `localStorage`에 평문으로
// 두지 않는다 — 기기를 잡은 사람이 그대로 읽는다. 출소자 대상 서비스에서 이 토큰은
// "이 사람이 출소자다"라는 사실로 가는 열쇠다.
//
// **웹에서는 `localStorage`에 둔다. 평문이다.**
//
// 처음에는 웹에서 아무것도 저장하지 않았다. `expo-secure-store`가 웹을 지원하지 않고
// 남은 것이 `localStorage`뿐인데 그것이 평문이라, "없는 것이 평문보다 낫다"고 정했다.
//
// **그 선택이 실제로는 쓸 수 없는 화면을 만들었다.** 새로고침 한 번에 27문항을 다시
// 답해야 했다. 심사·시연을 웹으로 하는데(§2.6) 그 자리에서 처음으로 돌아가는 것은
// 기능이 없는 것과 같다. 그래서 결정을 뒤집는다 (2026-08-24).
//
// **무엇을 감수하는지 분명히 적어 둔다.** 공용 PC에서 브라우저를 닫아도 토큰이 남고,
// 다음 사람이 개발자 도구로 읽거나 그대로 앱에 들어올 수 있다. 앱(iOS Keychain·
// Android Keystore)에는 해당하지 않고 웹에만 해당한다.
//
// 완화책 둘을 함께 둔다.
//   - **토큰만 둔다.** 진단 답변·이름·할 일은 여기 두지 않는다. 그것들은 서버에서
//     받아 메모리에만 있는다 — 브라우저에 남는 것은 열쇠 하나뿐이다
//   - 서버 세션에 만료가 있어 토큰이 영원히 살아 있지는 않다
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY = "majung.session";

/** 이번에 앱을 켜 있는 동안의 값. 저장소가 막혀 있으면 이것만 남는다. */
let memory: string | null = null;

const isWeb = Platform.OS === "web";

/** 브라우저가 저장소를 막아 두었을 수 있다(사생활 보호 모드 등). 그때는 메모리로 산다. */
function webStore(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  memory = token;
  if (isWeb) {
    try {
      webStore()?.setItem(KEY, token);
    } catch {
      // 저장이 막혀 있으면 이번 탭에서만 산다. 그것 때문에 가입을 막지 않는다.
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(KEY, token);
  } catch {
    // 기기가 보안 저장소를 못 쓰는 경우가 있다(잠금 설정 없음 등).
    // 그때는 메모리에만 두고 앱을 닫으면 사라진다 — 저장 실패로 앱을 멈추지 않는다.
  }
}

export async function loadToken(): Promise<string | null> {
  if (memory) return memory;
  if (isWeb) {
    try {
      memory = webStore()?.getItem(KEY) ?? null;
    } catch {
      memory = null;
    }
    return memory;
  }
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
  if (isWeb) {
    try {
      webStore()?.removeItem(KEY);
    } catch {
      // 이미 없으면 그것도 지워진 상태다.
    }
    return;
  }
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // 이미 없으면 그것도 지워진 상태다.
  }
}
