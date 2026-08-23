// 저장된 내 정보 (§2.5·§9.4).
//
// 정보를 저장하는 이상 사용자가 자기 정보를 보고 고치고 지울 수 있어야 하며, 이것은
// 법적 요구사항이다. 이 화면을 만들지 않을 수는 없다.
import type { CrimeCategoryId } from "@/shared/types/crime";

export type StoredProfile = {
  name: string;
  /** YYYY-MM-DD. 이 화면에 들어올 때 확인용으로도 쓴다. */
  birth: string;
  releaseDate: string;
  /** 말하지 않기로 했으면 null. 나중에 입력하거나 지울 수 있다 (§3.3-3). */
  crime: CrimeCategoryId | null;
  /** 담당자에게 정보를 알려주는 것에 동의했는지 (§3.4의 선택 항목). */
  sharesWithStaff: boolean;
};

/** 지울 수 있는 범위. 계정 전체 삭제와 항목별 철회는 다르다 (§9.4). */
export type EraseScope = "crime" | "account";

/** 화면에서는 "죄목"이라는 말을 쓰지 않는다. 다른 화면과 같은 완곡한 표현으로 낸다. */
export function eraseTitle(scope: EraseScope): string {
  return scope === "crime" ? "어떤 일로 계셨는지 지울까요?" : "모든 정보를 지울까요?";
}

/** 지우면 무엇이 사라지는지 미리 알린다. 되돌릴 수 없는 일이다. */
export function eraseDetail(scope: EraseScope): readonly string[] {
  if (scope === "crime") {
    return [
      "어떤 일로 계셨는지는 지워져요.",
      "다른 정보는 그대로 있어요.",
      "일자리 안내는 조금 덜 자세해져요.",
      "나중에 다시 알려주실 수 있어요.",
    ];
  }
  return [
    "이름, 생일, 출소한 날이 모두 지워져요.",
    "지금까지 나눈 대화도 함께 지워져요.",
    "할 일 목록도 사라져요.",
    "지우면 되돌릴 수 없어요.",
  ];
}

export function eraseConfirmLabel(scope: EraseScope): string {
  return scope === "crime" ? "이것만 지울게요" : "모두 지울게요";
}

/** 날짜를 사람이 읽는 형태로. 저장값은 YYYY-MM-DD다. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

/**
 * 이 화면에 들어올 때 생일을 한 번 확인한다 (§2.5).
 *
 * 앱 전체에는 잠금을 걸지 않는다. 켜면 바로 홈으로 들어간다. 본인은 이미 아는 값이라
 * 부담이 없고, 기기를 주운 사람은 알 수 없다. PIN을 새로 만들게 하는 것보다 가볍다.
 * 아직 확정이 아니라 제안이다 (§12-8).
 */
export function birthMatches(stored: string, input: { year: string; month: string; day: string }) {
  const [y, m, d] = stored.split("-");
  return (
    y === input.year && Number(m) === Number(input.month) && Number(d) === Number(input.day)
  );
}
