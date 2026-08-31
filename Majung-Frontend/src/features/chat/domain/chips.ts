// 대화창 입력칸 위에 뜨는 칩 (§6.1).
//
// **빈 입력창은 저리터러시 사용자에게 가장 어려운 화면이다.** 물어볼 것이 없어서가
// 아니라 어떻게 물어야 할지 몰라서 멈춘다. 눌러서 보내면 되는 문장을 몇 개 둔다.
//
// 칩은 자리 하나에 두 가지가 번갈아 든다.
//   - 대화가 아직 없을 때 → 그 할 일에 맞는 첫 질문 (서버가 보낸다)
//   - 답을 받은 뒤       → AI가 흐름을 보고 제안한 다음 질문 셋
//
// **판단을 화면이 아니라 여기서 한다.** 세 갈래 정책이라 View가 들 것이 아니고,
// 순수 함수로 두어야 계산 검증(jest)이 닿는다.

/**
 * 할 일을 모를 때 쓰는 기본 문구.
 *
 * **서버가 첫 질문을 안 보내는 경로가 있다.** 옛 배포본이거나 표에 아직 없는
 * 항목이다. 그때 칩 자리가 통째로 비면 이 장치를 둔 뜻이 사라지므로, 어느
 * 할 일에서나 말이 되는 네 개로 물러선다.
 */
export const PRESETS: readonly string[] = [
  "오늘 뭐 해야 해요?",
  "어디로 가면 돼요?",
  "무슨 서류가 필요해요?",
  "돈이 드나요?",
];

/** 한 번에 낼 제안의 최대 개수. 화면 폭에도 셋이 맞는다. */
const MAX_SUGGESTIONS = 3;

/**
 * 서버가 보낸 제안을 화면에 낼 만큼만 다듬는다.
 *
 * **서버가 이미 셋으로 맞춰 보내지만 여기서 한 번 더 줄인다.** 계약이 어긋나
 * 넷이 와도 화면이 넘치지 않아야 하고, 빈 문자열이 섞이면 누를 수 없는 칩이 생긴다.
 */
export function takeThree(questions: readonly string[] | undefined): readonly string[] {
  if (!questions) return [];
  return questions
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, MAX_SUGGESTIONS);
}

type ChipInput = {
  /** 대화가 한 마디라도 오갔는지. */
  hasMessages: boolean;
  /** 그 할 일의 첫 질문. 서버가 안 보냈으면 비어 있다. */
  starterQuestions?: readonly string[];
  /** AI가 제안한 다음 질문. 못 만들었으면 비어 있다. */
  suggestions?: readonly string[];
};

/**
 * 지금 칩 자리에 낼 문장들.
 *
 * **대화가 오간 뒤에 제안이 없으면 빈 배열이다.** 기본 문구로 되돌아가면 안 된다 —
 * "오늘 뭐 해야 해요?"를 이미 답한 뒤에 그 질문이 다시 뜨고, 사용자는 앞의 답이
 * 지워진 줄 안다. 빈 배열이면 화면이 그 자리를 아예 만들지 않는다.
 */
export function chipsFor({
  hasMessages,
  starterQuestions,
  suggestions,
}: ChipInput): readonly string[] {
  if (hasMessages) return takeThree(suggestions);
  const starters = (starterQuestions ?? []).map((q) => q.trim()).filter(Boolean);
  return starters.length > 0 ? starters : PRESETS;
}
