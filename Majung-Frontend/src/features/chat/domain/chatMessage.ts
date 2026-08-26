// AI 채팅 팝업의 메시지 모형 (§6.1·§6.4).
// 근거의 확실성이 다른데 같은 어조로 말하면 사용자는 인터넷에서 주워온 말을 제도 안내로 믿는다.
// 그래서 어디서 가져온 답인지를 말풍선이 직접 드러낸다.

/** 근거 단계. ③ 연결(연락처)은 단계가 아니라 모든 답변에 붙는 것이라 여기에 없다. */
export type EvidenceStage = "rag" | "web";

/**
 * 이 답이 어디서 왔는지 (§6.4).
 *
 * **확인 날짜는 여기 없다.** 카드마다 자기 날짜를 갖고 있고, 답변 배지에 하나를 골라
 * 붙이면 그 날짜가 어느 카드의 것인지 알 수 없다. 그리고 답변 말풍선 안에 있으면
 * "답변을 확인했다"로 읽힌다 — **확인한 것은 제도 안내이지 그 답이 질문에 맞다는
 * 판정이 아니다.** 날짜는 카드 말풍선에만 둔다.
 */
export type Evidence = {
  stage: EvidenceStage;
  /** 출처 기관명. 화이트리스트가 넓어진 만큼 어느 기관 말인지 보이지 않으면 한 덩어리로 읽힌다. */
  org: string;
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
