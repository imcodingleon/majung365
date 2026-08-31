// 목록 오른쪽에 붙는 시각 표기.
//
// **알림 화면은 다른 형식을 쓴다** (`features/alerts/domain/alert.ts`의 `timeLabel`,
// "오후 2시 30분"). 저리터러시 전제에서 숫자보다 말이 읽기 쉽다고 보고 그렇게 두었는데,
// 2026-08-31 시안이 채팅 목록에 "오전 08:16"을 명시했다. 시안이 정한 자리만 시안을
// 따르고 알림은 건드리지 않았다 — 어느 쪽으로 통일할지는 아직 정해지지 않았다.

/** 시각을 시계 모양으로. 예: "오전 08:16". 값이 없거나 망가졌으면 빈 문자열이다. */
export function clockLabel(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const half = at.getHours() < 12 ? "오전" : "오후";
  const hour = at.getHours() % 12 === 0 ? 12 : at.getHours() % 12;
  return `${half} ${String(hour).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/**
 * 목록 오른쪽에 붙는 때. 오늘 것만 시각으로 내고 그 전은 날짜로 낸다.
 *
 * **시각만 내면 지난 것이 오늘 일로 읽힌다.** 닷새 전에 나눈 대화가 "오전 06:10"으로
 * 떠서, 목록만 보고는 오늘 아침에 이야기한 것과 구별되지 않았다. 메신저가 날짜를
 * 섞어 내는 것도 같은 이유다.
 *
 * 요일은 붙이지 않는다. 이 칸은 폭이 68px이라 "8월 26일 수요일"이 들어가지 않는다 —
 * 날짜 줄을 따로 두는 알림 화면(`features/alerts/domain/alert.ts`의 `dayLabel`)과
 * 갈리는 지점이다.
 */
export function listWhenLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";

  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(at)) / 86_400_000);

  // 서버와 기기의 시계가 어긋나면 앞선 시각이 올 수 있다. 그때는 오늘로 친다 —
  // "-1일 뒤"라고 적을 자리가 아니다.
  if (days <= 0) return clockLabel(iso);
  if (days === 1) return "어제";
  return `${at.getMonth() + 1}월 ${at.getDate()}일`;
}
