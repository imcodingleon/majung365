// 가입 단계의 수집 항목과 동의 (§3.2·§3.3·§3.4).
//
// 저장하지 않을 때는 유출될 데이터 자체가 없었다. 저장하는 순간부터 "출소자 명단"이 실재하므로
// 여기서 다루는 값은 전부 고민감 정보다. 화면에 되불러오는 자리도 네 곳으로 한정된다 (§2.5).
import type { ConsentInput, SignupRequest } from "@/shared/types/account";
import {
  CRIME_CATEGORIES,
  needsCrimeConsent,
  type CrimeCategory,
  type CrimeCategoryId,
} from "@/shared/types/crime";
import type { IntakeAnswerMap } from "@/shared/types/intake";
import { toIsoDate, type DateParts } from "@/shared/types/date";

export type { CrimeCategory, CrimeCategoryId };
export { CRIME_CATEGORIES, needsCrimeConsent };


/**
 * 동의 항목.
 *
 * **`location`은 서버로 가지 않는다.** 나머지 셋은 무엇을 모으고 누구에게 주는지에
 * 대한 동의라 기록이 남아야 하지만, 위치는 모으지도 보내지도 않아서 서버가 기록할
 * 대상 자체가 없다. 기기가 위치를 읽어도 되는지만 정한다.
 */
export type ConsentId = "privacy" | "crime" | "share" | "location";

export type ConsentItem = {
  id: ConsentId;
  /**
   * 동의 항목명. **여기만 격식체 명사구다.**
   *
   * 나머지 화면은 "쉬운 말·-어요체"를 지키지만 동의란은 법적 효력이 걸린 고지이며,
   * 사용자가 다른 서비스에서 이미 익힌 형식이 따로 있다. 그 형식을 깨면 오히려
   * 무엇에 동의하는 것인지 알아보기 어려워진다. 대신 아래 `plain`이 쉬운 말을 맡는다.
   */
  label: string;
  /** 같은 내용을 쉬운 말로 한 줄. 항목명만으로는 저리터러시 사용자가 읽어내지 못한다. */
  plain: string;
  /** 체크해야 진행할 수 있는 항목. */
  required: boolean;
  /** 체크하지 않으면 무엇이 제한되는지 미리 알린다 (§3.4-4). */
  limitNote?: string;
};

export const CONSENT_ITEMS: readonly ConsentItem[] = [
  {
    id: "privacy",
    label: "개인정보 수집·이용 동의",
    // **위치가 여기 들어 있다** (2026-08-26 결정 F-1). 아래 위치 항목은 쓰겠다는
    // 허락을 받는 자리이고, 모으고 저장한다는 고지는 이 필수 동의가 진다.
    plain: "이름, 생일, 지금 계신 곳 같은 정보를 모으고 쓰는 데 동의해요.",
    required: true,
  },
  // 민감정보라 다른 개인정보 동의와 묶어서 한 번에 받지 않는다 (§3.4-1 · §9.5).
  // 죄목을 밝힌 경우에만 나타나고, 나타나면 체크해야 진행할 수 있다 (§3.4-2).
  {
    id: "crime",
    label: "민감정보 수집·이용 동의",
    plain: "어떤 일로 계셨는지 모으고 쓰는 데 동의해요.",
    required: true,
  },
  {
    id: "share",
    label: "개인정보 제3자 제공 동의",
    plain: "공단 담당자에게 내 정보를 알려주는 데 동의해요.",
    required: false,
    limitNote: "동의하지 않으면 담당자에게 방문을 미리 알릴 수 없어요. 나중에 다시 정하실 수 있어요.",
  },
  // **딸린 설명을 지웠다** (2026-08-26 결정 F-1). "위치는 저장하지 않고 어디로도
  // 보내지 않아요"라고 적혀 있었는데, 좌표를 서버로 보내고 저장하기로 하면서 그 말이
  // 거짓이 됐다. 고쳐 쓰려니 더 어색해져서 지우고, 모으고 저장한다는 고지는 위의
  // 개인정보 수집·이용 동의가 진다.
  {
    id: "location",
    label: "위치 정보 이용 동의",
    plain: "지금 계신 곳 가까운 기관을 알려드리는 데 써요.",
    required: false,
    limitNote: "동의하지 않으셔도 지역을 직접 고르실 수 있어요.",
  },
];

export type ConsentState = Record<ConsentId, boolean>;

export const EMPTY_CONSENT: ConsentState = {
  privacy: false,
  crime: false,
  share: false,
  location: false,
};

/** 지금 화면에 보여야 하는 동의 항목. 수집하지 않는 정보에 동의를 받을 이유가 없다 (§3.4-2). */
export function visibleConsents(crime: CrimeCategoryId | null): readonly ConsentItem[] {
  const showCrime = needsCrimeConsent(crime);
  return CONSENT_ITEMS.filter((c) => c.id !== "crime" || showCrime);
}

/** 화면에 보이는 필수 항목을 모두 체크했는지 (§3.4-3). */
export function consentSatisfied(crime: CrimeCategoryId | null, state: ConsentState): boolean {
  return visibleConsents(crime)
    .filter((c) => c.required)
    .every((c) => state[c.id]);
}

// 날짜 값과 검사는 여러 화면이 함께 쓰므로 shared로 올렸다. 가입 화면이 쓰던 이름을 그대로
// 다시 내보내 부르는 쪽이 바뀌지 않게 한다.
export { EMPTY_DATE, isValidDate } from "@/shared/types/date";
export { toIsoDate, type DateParts };

/**
 * 서버로 보낼 가입 요청을 만든다 (§3.8·§9.1).
 *
 * **여기서 두 가지를 덜어낸다.**
 *   - 화면에 보이지 않은 동의는 담지 않는다. 죄목을 말하지 않기로 했으면 죄목 동의도 없다
 *   - `undisclosed`는 값으로 보내지 않는다. **말하지 않겠다고 한 것을 "말하지 않음"이라는
 *     값으로 저장하면 그것도 하나의 기록이 된다**
 *
 * 날짜가 유효하지 않으면 null이다. 화면이 막고 있지만 여기서도 확인한다 — 서버에
 * 형식이 틀린 값을 보내면 사용자가 이유를 알 수 없는 오류를 본다.
 */
export function toSignupRequest(input: {
  name: string;
  birth: DateParts;
  releaseDate: DateParts;
  crime: CrimeCategoryId | null;
  consent: ConsentState;
  answers: IntakeAnswerMap;
}): SignupRequest | null {
  const birth = toIsoDate(input.birth);
  const release = toIsoDate(input.releaseDate);
  if (!birth || !release || !input.name.trim()) return null;

  // **위치 동의는 서버로 보내지 않는다.** 위치를 모으지도 보내지도 않으므로 서버가
  // 기록할 대상이 없다. 보내면 "무언가 수집한다"는 잘못된 기록이 남는다.
  const consents: ConsentInput[] = visibleConsents(input.crime)
    .filter((c) => c.id !== "location")
    .map((c) => ({
    kind: c.id as ConsentInput["kind"],
    agreed: input.consent[c.id],
  }));

  const request: SignupRequest = {
    name: input.name.trim(),
    birth_date: birth,
    release_date: release,
    answers: input.answers,
    consents,
  };

  // 말하지 않기로 했으면 필드 자체를 만들지 않는다.
  if (input.crime && input.crime !== "undisclosed") {
    request.crime_category = input.crime;
  }
  return request;
}
