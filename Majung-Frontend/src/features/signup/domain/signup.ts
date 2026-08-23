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

/** 죄목을 말하지 않아도 되고, 그때 무엇이 달라지는지 문항 아래에 한 줄로 알린다 (§3.3-2). */
export const CRIME_OPTIONAL_NOTE =
  "말하지 않으셔도 괜찮아요. 다만 일자리 안내는 조금 덜 자세할 수 있어요.";

export type ConsentId = "privacy" | "crime" | "share";

export type ConsentItem = {
  id: ConsentId;
  label: string;
  /** 체크해야 진행할 수 있는 항목. */
  required: boolean;
  /** 체크하지 않으면 무엇이 제한되는지 미리 알린다 (§3.4-4). */
  limitNote?: string;
};

export const CONSENT_ITEMS: readonly ConsentItem[] = [
  { id: "privacy", label: "개인정보를 모으고 쓰는 데 동의해요", required: true },
  // 민감정보라 다른 개인정보 동의와 묶어서 한 번에 받지 않는다 (§3.4-1 · §9.5).
  // 죄목을 밝힌 경우에만 나타나고, 나타나면 체크해야 진행할 수 있다 (§3.4-2).
  { id: "crime", label: "어떤 일로 계셨는지 모으고 쓰는 데 동의해요", required: true },
  {
    id: "share",
    label: "공단 담당자에게 내 정보를 알려주는 데 동의해요",
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

/** 생년월일·출소일. 저리터러시 사용자를 전제해 년·월·일을 따로 받는다. */
export type DateParts = {
  year: string;
  month: string;
  day: string;
};

export const EMPTY_DATE: DateParts = { year: "", month: "", day: "" };

/**
 * 입력한 날짜가 실제로 있는 날인지 본다. 형식만 맞고 없는 날(2월 30일 등)이면 거짓이다.
 * 주민등록번호는 받지 않으므로 생일만으로 동명이인을 구분한다 (§3.2).
 */
export function isValidDate({ year, month, day }: DateParts): boolean {
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) return false;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (y < 1900 || m < 1 || m > 12 || d < 1) return false;
  const lastDay = new Date(y, m, 0).getDate();
  return d <= lastDay;
}

/** 서버로 보낼 형태(YYYY-MM-DD). 유효하지 않으면 null이다. */
export function toIsoDate(parts: DateParts): string | null {
  if (!isValidDate(parts)) return null;
  const m = parts.month.padStart(2, "0");
  const d = parts.day.padStart(2, "0");
  return `${parts.year}-${m}-${d}`;
}

/**
 * §3.5에서 교체가 확정된 안내 문구. 고지 내용과 실제 처리가 다르면 신뢰가 무너진다.
 * 한 문장에 한 가지만 담는다는 §3.9-⑦에 따라 세 문장으로 나눴다 (2026-08-23 기획 수정).
 */
export const STORAGE_NOTICE =
  "입력하신 정보는 암호화해서 안전하게 보관해요. 할 일 목록을 만들고 담당자와 연결하는 데에만 써요. 언제든지 지우실 수 있어요.";
