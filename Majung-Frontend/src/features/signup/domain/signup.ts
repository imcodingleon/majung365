// 가입 단계의 수집 항목과 동의 (§3.2·§3.3·§3.4).
//
// 저장하지 않을 때는 유출될 데이터 자체가 없었다. 저장하는 순간부터 "출소자 명단"이 실재하므로
// 여기서 다루는 값은 전부 고민감 정보다. 화면에 되불러오는 자리도 네 곳으로 한정된다 (§2.5).
import {
  CRIME_CATEGORIES,
  needsCrimeConsent,
  type CrimeCategory,
  type CrimeCategoryId,
} from "@/shared/types/crime";

export type { CrimeCategory, CrimeCategoryId };
export { CRIME_CATEGORIES, needsCrimeConsent };


export type ConsentId = "privacy" | "crime" | "share";

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
    plain: "이름과 생일 같은 정보를 모으고 쓰는 데 동의해요.",
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
];

export type ConsentState = Record<ConsentId, boolean>;

export const EMPTY_CONSENT: ConsentState = { privacy: false, crime: false, share: false };

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
export { EMPTY_DATE, isValidDate, toIsoDate, type DateParts } from "@/shared/types/date";
