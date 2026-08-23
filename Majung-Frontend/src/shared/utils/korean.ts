// 조사를 앞말에 맞춰 고른다.
//
// **조사가 틀리면 기계가 쓴 문장으로 읽힌다.** "오전으로 정해졌어요"·"주민센터을(를)"처럼
// 한 글자가 어긋나면, 큰 글씨로 천천히 읽는 사용자일수록 먼저 걸린다.
//
// 값이 무엇으로 끝날지 미리 알 수 없는 자리에서만 쓴다. 고정된 문구에는 손으로 맞는
// 조사를 적는 편이 읽기 쉽다.

/** 숫자를 한국어로 읽었을 때 받침이 있는지. 영·일·삼·육·칠·팔이 그렇다. */
const DIGIT_HAS_FINAL: Record<string, boolean> = {
  "0": true,
  "1": true,
  "2": false,
  "3": true,
  "4": false,
  "5": false,
  "6": true,
  "7": true,
  "8": true,
  "9": false,
};

/**
 * 앞말에 받침이 있는지.
 *
 * 전화번호처럼 숫자로 끝나는 값도 다룬다 — "1588"은 "팔"로 끝나므로 받침이 있다.
 * 판단할 수 없는 글자(영문·기호)로 끝나면 받침이 없는 것으로 본다.
 */
export function hasFinalConsonant(word: string): boolean {
  const last = word.trim().slice(-1);
  if (!last) return false;
  if (last >= "0" && last <= "9") return DIGIT_HAS_FINAL[last];
  if (last < "가" || last > "힣") return false;
  return (last.charCodeAt(0) - 0xac00) % 28 !== 0;
}

/**
 * 앞말에 맞는 조사를 고른다. `withFinal`은 받침이 있을 때 쓰는 쪽이다.
 *
 * 예: `josa(place, "으로", "로")` · `josa(name, "을", "를")`
 */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  return hasFinalConsonant(word) ? withFinal : withoutFinal;
}

/**
 * 여러 낱말을 "와/과"로 잇는다.
 *
 * **여기도 앞말에 따라 갈린다.** "신분증과 통장"은 맞지만 "통장과"는 "통장와"가
 * 되어야 할 자리가 아니고, 반대로 받침 없는 말 뒤에 "과"를 붙이면 어색해진다.
 */
export function joinKorean(words: readonly string[]): string {
  return words.reduce((acc, word, i) =>
    i === 0 ? word : `${acc}${josa(acc, "과", "와")} ${word}`,
  "");
}
