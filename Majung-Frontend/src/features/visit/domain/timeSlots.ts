// 방문 시간 후보 (§7.2).
//
// 날짜를 직접 입력하게 하지 않는다. 프로토타입처럼 고를 수 있는 목록으로 낸다.
// 저리터러시 사용자에게 달력과 시각 입력은 부담이 크고, 실제로 필요한 정밀도도 그 정도가 아니다.

export type TimeSlot = {
  /** 저장·전송에 쓰는 값. 예: "2026-08-25-am" */
  id: string;
  /** 화면에 보이는 말. 예: "8월 25일 월요일 오전" */
  label: string;
};

const WEEKDAY_NAMES = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

/**
 * 오늘 다음 날부터 평일만 골라 오전·오후 후보를 만든다.
 *
 * 주말을 후보에 넣지 않는 것은 주민센터와 공단이 평일에만 열기 때문이다. 고를 수 있게 두면
 * 헛걸음이 된다. (확정 사양이 아니라 판단이므로 기획 확인 대상이다.)
 */
export function buildTimeSlots(from: Date, days = 5): readonly TimeSlot[] {
  const slots: TimeSlot[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  while (slots.length < days * 2) {
    cursor.setDate(cursor.getDate() + 1);
    const weekday = cursor.getDay();
    if (weekday === 0 || weekday === 6) continue;

    const month = cursor.getMonth() + 1;
    const day = cursor.getDate();
    const dayName = WEEKDAY_NAMES[weekday];
    const datePart = `${cursor.getFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    slots.push({ id: `${datePart}-am`, label: `${month}월 ${day}일 ${dayName} 오전` });
    slots.push({ id: `${datePart}-pm`, label: `${month}월 ${day}일 ${dayName} 오후` });
  }

  return slots;
}

export function slotLabel(slots: readonly TimeSlot[], id: string | null): string {
  if (!id) return "";
  return slots.find((s) => s.id === id)?.label ?? "";
}
