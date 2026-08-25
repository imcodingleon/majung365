// 서버가 준 방문 요청을 담당자 화면 타입으로 옮긴다 (§7.4·§8.1).
//
// 계약과 화면 타입을 따로 두는 이유는 초기 진단 쪽과 같다. 계약은 서버가 정하고 화면
// 타입은 담당자 목록이 필요로 하는 모양이다. 둘을 합치면 계약이 바뀔 때마다 화면이 흔들린다.
//
// **시각을 사람이 읽는 말로 바꾸는 것이 여기서 하는 일의 절반이다.** 담당자는
// `2026-08-25T09:00:00+09:00`이 아니라 "8월 25일 월요일 오전"을 읽는다.
import type { StaffVisitResponse } from "@/shared/types";
import { routeLabel } from "@/shared/types/route";

import type { StaffRequest } from "./staffRequest";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "8월 25일 월요일 오전". 분 단위까지 내지 않는다 — 아직 정해진 시각이 아니다. */
export function timeLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const half = d.getHours() < 12 ? "오전" : "오후";
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일 ${half}`;
}

/** "오늘 오전 9시 12분" · "어제 오후 4시 40분" · "이틀 전". 받은 지 얼마나 됐는지가 중요하다. */
export function receivedLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  const half = d.getHours() < 12 ? "오전" : "오후";
  const hour = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  const clock = `${half} ${hour}시 ${d.getMinutes()}분`;

  if (days <= 0) return `오늘 ${clock} 받음`;
  if (days === 1) return `어제 ${clock} 받음`;
  if (days === 2) return "이틀 전 받음";
  return `${days}일 전 받음`;
}

export function toStaffRequest(v: StaffVisitResponse): StaffRequest {
  return {
    id: v.id,
    name: v.user_name,
    // 지원 항목 코드를 사람이 읽는 이름으로. 담당자도 "R9"를 읽지 않는다.
    purpose: routeLabel(v.route_id),
    firstChoice: timeLabel(v.preferred_at_1),
    firstChoiceAt: v.preferred_at_1,
    readyDocs: v.prepared_docs,
    // 필요한 준비물 전체는 서버가 주지 않는다. 카드 쪽 정보라 지금은 챙겨 온 것만 보인다.
    allDocs: v.prepared_docs,
    note: v.note || undefined,
    status: v.status,
    receivedAt: receivedLabel(v.created_at),
    // 서버가 정렬해 보낸 순서를 그대로 둔다.
    sharedAnswers: v.shared_answers ?? [],
  };
}
