// AI 채팅 팝업의 메시지 모형 (§6.1·§6.4).
// 근거의 확실성이 다른데 같은 어조로 말하면 사용자는 인터넷에서 주워온 말을 제도 안내로 믿는다.
// 그래서 어디서 가져온 답인지를 말풍선이 직접 드러낸다.

/** 근거 단계. ③ 연결(연락처)은 단계가 아니라 모든 답변에 붙는 것이라 여기에 없다. */
export type EvidenceStage = "rag" | "web";

export type Evidence = {
  stage: EvidenceStage;
  /** 출처 기관명. 화이트리스트가 넓어진 만큼 어느 기관 말인지 보이지 않으면 한 덩어리로 읽힌다. */
  org: string;
  /**
   * 마중365가 근거 문서를 확인한 날짜(YYYY-MM-DD). 기관이 문서를 갱신한 날짜가 아니다.
   * 그래서 "○월 ○일 기준"이라고 쓰지 않고 누가 확인했는지를 밝힌다.
   */
  checkedAt?: string;
};

/** 답변 끝에 붙는 담당 기관 연락처. LLM이 아니라 서버가 붙인다 (§6.4 ③단계). */
export type MessageContact = {
  org: string;
  phone: string;
  /** 상담 가능 시간이 확인된 곳만 채운다. 132처럼 점심에 끊기는 번호가 있다. */
  hours?: string;
};

/** 갈 곳이 하나로 정해지는 항목은 전화번호보다 창구 안내가 먼저 온다. */
export type MessageDesk = {
  place: string;
  say: string;
};

export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      text: string;
      evidence?: Evidence;
      desk?: MessageDesk;
      contact?: MessageContact;
      /** 스트리밍이 끝나지 않은 상태. */
      streaming?: boolean;
    }
  | {
      id: string;
      role: "search-notice";
      /**
       * 웹 검색 사전 고지 (§6.4 ②). 검색을 시작하기 전에 내보낸다.
       * 확실성이 낮다는 신호가 정보보다 앞서야 하고, 이 문장이 로딩 안내도 겸한다.
       */
      text: string;
    };

/** 검색 전에 반드시 먼저 나가는 문장. 나중에 덧붙이면 이미 사실로 받아들인 뒤다. */
export const SEARCH_NOTICE =
  "가지고 있는 자료에서는 찾지 못했어요. 인터넷에서 찾아볼게요.";

/** 검색 결과를 여는 문장. */
export const SEARCH_RESULT_LEAD = "인터넷에서 찾아보니 이렇게 나오네요. 다만 맞는지 한 번 더 확인해 주세요.";

/**
 * "이 안내는 마중365가 2026년 8월 23일에 확인했어요."
 *
 * **무엇을 확인했는지를 문장 안에 둔다.** "확인한 내용이에요"는 그 대상이 문장에 없어,
 * 답변과 카드를 한 흐름으로 읽으면 답변까지 확인한 것으로 읽힌다. 확인한 것은 안내이지
 * 그 답변이 질문에 맞다는 판정이 아니다.
 *
 * 확인한 주체도 남긴다 — "확인했어요"만 있으면 누가 확인했는지가 빠진다.
 *
 * **같은 문장을 카드 쪽은 서버가 만들어 보낸다**(`verified_note`). 서버가 "우리가 확인한
 * 날"과 "기관이 갱신한 날"을 구분해 조립하기 때문이며, 여기 문구가 그쪽과 어긋나면
 * 사용자는 같은 뜻을 화면마다 다르게 읽는다. 고칠 때 함께 맞춘다.
 */
export function checkedAtSentence(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return "";
  return `이 안내는 마중365가 ${y}년 ${Number(m)}월 ${Number(d)}일에 확인했어요.`;
}
