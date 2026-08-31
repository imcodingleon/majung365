// 담당자가 보는 방문 요청 (§7.1·§7.4·§8).
//
// **최소 노출 원칙이다.** 담당자가 방문 응대에 필요한 것만 담는다.
// 죄목과 생일은 여기에 없다. 타입에 자리를 두지 않는 것이 필터로 거르는 것보다 확실하다.

import type { SharedAnswerOut, SummaryStatus } from "@/shared/types/staffVisit";
import type { VisitStatus } from "@/shared/types/visit";

export type StaffRequest = {
  id: string;
  /** 본인 확인용. */
  name: string;
  /** 무슨 일로 오는지. 지원 항목 이름이 들어온다. */
  purpose: string;
  /** 사용자가 가고 싶다고 적어낸 시간. 사람이 읽는 형태다. */
  wantedLabel: string;
  /**
   * 같은 시간의 원본 값(ISO).
   *
   * **화면은 사람이 읽는 말로 그리고 서버는 시각을 받는다.** 확정할 때 담당자가 고른
   * 원본이 없으면 만나기로 한 시각을 못 보내고, 서버가 사용자 희망 시각으로 채운다.
   */
  wantedAt: string | null;
  /** 챙겨 온다고 표시한 준비물. */
  readyDocs: readonly string[];
  /** 이 요청에서 필요한 준비물 전체. 위 목록과 견줘 무엇이 빠졌는지 본다. */
  allDocs: readonly string[];
  /** 사용자가 직접 쓴 경우에만 있다. */
  note?: string;
  /** 기한이 있는 제도를 상담할 때만 온다 (§7.4). */
  releaseDate?: string;
  status: VisitStatus;
  /** 받은 시각. 사람이 읽는 형태다. */
  receivedAt: string;
  /**
   * 본인이 함께 보내기로 한 초기 진단 답변 (§7.4-1).
   *
   * **서버가 정렬해 보낸 순서 그대로다.** 화면에서 다시 정렬하지 않는다.
   * 동의하지 않았으면 비어 있으며, 그때는 구역 자체를 그리지 않는다.
   */
  sharedAnswers: readonly SharedAnswerOut[];
  /**
   * 담당자가 먼저 읽는 요약 (§7.4).
   *
   * **답변 원문을 대체하지 않는다.** 요약을 위에 놓고 원문은 접어 두되, 요약이
   * 없거나 만들지 못했으면 원문을 그대로 펼쳐 보여 준다. 담당자가 볼 것이
   * 사라지는 경우를 만들지 않는다.
   */
  summary: string;
  summaryStatus: SummaryStatus;
};

/**
 * 확정할 때 담당자가 채우는 값 (§7.1).
 *
 * **만날 사람과 만날 장소가 이 기능의 핵심이다.** 창구에서 신분이 드러나는 순간이
 * 실질적 장벽이라는 인터뷰 결과의 해법은 시간 예약이 아니라 누구를 찾아가면 되는지
 * 아는 것이다. 둘 중 하나라도 비면 확정할 수 없다.
 */
export type ConfirmInput = {
  /** §7.1이 "이 기능의 핵심"이라고 적은 둘. */
  staffName: string;
  place: string;
  /**
   * 만나기로 한 시각(ISO). 덜 골랐으면 `null`이다.
   *
   * **처음 값은 출소자가 적어낸 때다** (2026-08-26 결정). 담당자가 시각을 다시 정하지
   * 않기로 했던 것을 되돌렸다 — 기관이 언제 문을 여는지는 담당자가 알고, 안 되는 때를
   * 채팅으로만 조율하면 확정까지 하루가 더 걸린다. 그대로 두면 손대지 않은 것이다.
   */
  whenIso: string | null;
};

export function canConfirm(input: ConfirmInput): boolean {
  return (
    input.staffName.trim().length > 0 &&
    input.place.trim().length > 0 &&
    // **시각 없이 확정하지 않는다.** 서버가 대신 채워 주던 자리를 담당자가 정하기로
    // 한 이상, 덜 고른 채로 보내면 무엇으로 확정됐는지 아무도 모른다.
    input.whenIso !== null
  );
}

/** 담당자 화면에 보이는 상태 이름. 출소자 화면의 문구와 다르다. */
export function statusLabel(status: VisitStatus): string {
  switch (status) {
    case "sent":
      return "새 요청";
    case "acknowledged":
      return "확인";
    case "confirmed":
      return "확정";
    case "reschedule_proposed":
      return "시간 변경 제안";
    case "completed":
      return "방문 완료";
    case "cancelled":
      return "취소";
  }
}

/** 아직 손대지 않은 요청. 목록에서 위로 올린다. */
export function isNew(status: VisitStatus): boolean {
  return status === "sent";
}

/** 챙겨 오지 않는 준비물. 담당자가 미리 알면 헛걸음을 막는다. */
export function missingDocs(request: StaffRequest): readonly string[] {
  return request.allDocs.filter((d) => !request.readyDocs.includes(d));
}

/**
 * 화면이 그리는 요약의 모양 (§7.4).
 *
 * **조각으로 받는다** (2026-08-31 결정). 문단 하나로 받던 것을 나눴다 — 다섯
 * 문장이 이어 붙으면 담당자가 창구에서 훑지 못하고 원문을 읽는 것과 다르지 않았다.
 */
export type SummaryPoint = { label: string; text: string };
export type SummaryView = {
  headline: string;
  points: readonly SummaryPoint[];
  prepare: readonly string[];
  /** 옛 형식(문단 하나)으로 저장된 요약. 조각이 아니라 통째로 그린다. */
  paragraph: string;
};

/**
 * 저장된 요약을 화면이 쓸 모양으로.
 *
 * **옛 형식도 그린다.** 조각으로 바꾸기 전에 저장된 요약이 남아 있고, 그것도
 * 담당자에게는 여전히 쓸모가 있다. 모양을 못 읽으면 문단으로 본다.
 */
export function parseSummary(raw: string): SummaryView | null {
  const text = raw.trim();
  if (!text) return null;

  const empty = { headline: "", points: [], prepare: [], paragraph: text };
  if (!text.startsWith("{")) return empty;

  try {
    const found: unknown = JSON.parse(text);
    if (!found || typeof found !== "object" || Array.isArray(found)) return empty;
    const data = found as Record<string, unknown>;

    const points: SummaryPoint[] = Array.isArray(data.points)
      ? data.points
          .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
          .map((p) => ({ label: String(p.label ?? "").trim(), text: String(p.text ?? "").trim() }))
          .filter((p) => p.text.length > 0)
      : [];
    const prepare: string[] = Array.isArray(data.prepare)
      ? data.prepare.map((x) => String(x).trim()).filter(Boolean)
      : [];
    const headline = String(data.headline ?? "").trim();

    if (!headline && points.length === 0) return null;
    return { headline, points, prepare, paragraph: "" };
  } catch {
    return empty;
  }
}
