// 담당자가 보는 방문 요청 (§7.1·§7.4·§8).
//
// **최소 노출 원칙이다.** 담당자가 방문 응대에 필요한 것만 담는다.
// 죄목과 생일은 여기에 없다. 타입에 자리를 두지 않는 것이 필터로 거르는 것보다 확실하다.

import type { SharedAnswerOut } from "@/shared/types/staffVisit";
import type { VisitStatus } from "@/shared/types/visit";

export type StaffRequest = {
  id: string;
  /** 본인 확인용. */
  name: string;
  /** 무슨 일로 오는지. 지원 항목 이름이 들어온다. */
  purpose: string;
  /** 사용자가 가고 싶다고 적어낸 시간. 사람이 읽는 형태다. */
  firstChoice: string;
  /**
   * 같은 시간의 원본 값(ISO).
   *
   * **화면은 사람이 읽는 말로 그리고 서버는 시각을 받는다.** 확정할 때 담당자가 고른
   * 원본이 없으면 만나기로 한 시각을 못 보내고, 서버가 사용자 희망 시각으로 채운다.
   */
  firstChoiceAt: string | null;
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
};

/**
 * 확정할 때 담당자가 채우는 값 (§7.1).
 *
 * **만날 사람과 만날 장소가 이 기능의 핵심이다.** 창구에서 신분이 드러나는 순간이
 * 실질적 장벽이라는 인터뷰 결과의 해법은 시간 예약이 아니라 누구를 찾아가면 되는지
 * 아는 것이다. 둘 중 하나라도 비면 확정할 수 없다.
 */
export type ConfirmInput = {
  /** 확정한 방문 시각. 사용자 희망 시각을 그대로 쓰거나 다른 때를 고른다. */
  whenLabel: string;
  /**
   * 그 시각의 원본 값(ISO). **직접 적은 경우에는 없다.**
   *
   * 없으면 서버가 사용자 희망 시각으로 채운다 — 매번 입력하게 하면 빼먹었을 때 확정 자체가
   * 막히기 때문이다. 장소를 필수로 둔 것과 다른 판단이며, 장소는 서버가 알 수 없는
   * 정보이지만 시각은 이미 1지망이 있다.
   */
  whenIso?: string | null;
  staffName: string;
  place: string;
};

export function canConfirm(input: ConfirmInput): boolean {
  return (
    input.whenLabel.trim().length > 0 &&
    input.staffName.trim().length > 0 &&
    input.place.trim().length > 0
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
