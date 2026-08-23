// 화면에서 다루는 날짜 (§3.2).
//
// 년·월·일을 따로 들고 있는다. 저리터러시 사용자에게 한 칸짜리 날짜 입력은 부담이 크고,
// 눌러서 고르는 방식도 세 값을 각각 고르는 것이 자연스럽다.
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
