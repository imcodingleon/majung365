// 방문 시간의 규칙 (§7.2).
//
// **막는 것은 지난 날짜 하나뿐이다.**
//
// 주말과 점심시간도 막아 두었는데 걷어냈다. 기관마다 운영이 다르고 토요일에 여는
// 주민센터도 있는데, 우리가 일반 규칙으로 막으면 **실제로 갈 수 있는 때를 못 고르게
// 된다.** 언제 문을 여는지는 담당자가 안다 — 그래서 이 기능이 담당자 확인을 거친다.
//
// 고를 수 없는 때는 목록에서 빼지 않고 흐리게 둔다. 빼 버리면 날짜가 건너뛰어 보여
// 무슨 일인지 알 수 없다.
import type { PickerItem } from "@/shared/components/PickerBox";

/** 고른 때. 아직 안 고른 칸은 없다. */
export type VisitTime = {
  year?: number;
  month?: number;
  day?: number;
  /** 24시 기준. 오전 10시는 10, 오후 3시는 15다. */
  hour?: number;
};

/**
 * 고를 수 있는 시각.
 *
 * 9시에서 17시까지 한 시간 간격이다. 마지막을 17시로 잡은 것은 18시 마감 직전에
 * 도착하면 접수가 안 되기 때문이다.
 */
const OPEN_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17] as const;

/** 앞으로 고를 수 있는 달의 수. 두 달이면 넉넉하고, 더 열면 목록만 길어진다. */
const MONTH_SPAN = 2;

/** 그 달의 마지막 날. 2월 30일 같은 값이 애초에 만들어지지 않는다. */
export function lastDayOf(year: number | undefined, month: number | undefined): number {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

/** 같은 날인가. 지난 시각을 가릴 때 쓴다. */
function sameDay(a: Date, year: number, month: number, day: number): boolean {
  return a.getFullYear() === year && a.getMonth() + 1 === month && a.getDate() === day;
}

/** 월 목록. 연말을 넘어가면 내년 달이 이어진다. */
export function monthsFrom(today: Date): readonly (PickerItem & { year: number })[] {
  const out: (PickerItem & { year: number })[] = [];
  for (let i = 0; i <= MONTH_SPAN; i += 1) {
    const at = new Date(today.getFullYear(), today.getMonth() + i, 1);
    out.push({ value: at.getMonth() + 1, year: at.getFullYear() });
  }
  return out;
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 그 달에서 고를 수 있는 날.
 *
 * **오늘과 지난 날짜는 막는다.** 담당자가 확인하고 답하는 시간이 필요해서 당일 방문은
 * 이 기능이 하려는 일("미리 알린다")과 맞지 않는다.
 */
export function pickableDays(
  year: number | undefined,
  month: number | undefined,
  today: Date,
): readonly PickerItem[] {
  if (!year || !month) return [];
  const last = lastDayOf(year, month);
  const out: PickerItem[] = [];
  for (let day = 1; day <= last; day += 1) {
    const at = new Date(year, month - 1, day);
    const past =
      at.getTime() <=
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    out.push({
      value: day,
      label: `${day}일 (${WEEKDAY[at.getDay()]})`,
      disabled: past,
    });
  }
  return out;
}

/** 오전 9시 → "오전 9시". 확정 문구와 담당자 화면이 같은 말을 쓰게 한다. */
export function hourLabel(hour: number): string {
  return hour < 12 ? `오전 ${hour}시` : hour === 12 ? "낮 12시" : `오후 ${hour - 12}시`;
}

/**
 * 그날 고를 수 있는 시각.
 *
 * **오늘 날짜는 애초에 못 고르므로 지난 시각을 가릴 일이 없다.** 그래도 검사를 남겨
 * 두는 것은, 나중에 당일 방문을 열게 되면 이 자리가 그대로 필요해지기 때문이다.
 */
export function hoursOf(
  year: number | undefined,
  month: number | undefined,
  day: number | undefined,
): readonly PickerItem[] {
  if (!year || !month || !day) return [];
  const now = new Date();
  const isToday = sameDay(now, year, month, day);
  return OPEN_HOURS.map((hour) => ({
    value: hour,
    label: hourLabel(hour),
    disabled: isToday && hour <= now.getHours(),
  }));
}

/** 세 칸이 다 찼는가. 하나라도 비면 보낼 수 없다. */
export function isComplete(time: VisitTime): boolean {
  return Boolean(time.year && time.month && time.day && time.hour);
}

/** 서버로 보낼 시각. 덜 골랐으면 null이다. */
export function toIso(time: VisitTime): string | null {
  if (!isComplete(time)) return null;
  return new Date(time.year!, time.month! - 1, time.day!, time.hour!, 0, 0).toISOString();
}

/** 화면에 읽히는 말. 예: "8월 26일 (수) 오전 10시" */
export function timeLabel(time: VisitTime): string {
  if (!isComplete(time)) return "";
  const at = new Date(time.year!, time.month! - 1, time.day!);
  return `${time.month}월 ${time.day}일 (${WEEKDAY[at.getDay()]}) ${hourLabel(time.hour!)}`;
}
