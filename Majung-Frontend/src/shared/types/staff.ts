// 담당자 로그인 계약 미러 (§8.2).
//
// 정본: Majung-Backend/app/domains/staff/adapter/inbound/api/router.py
//
// **가입 엔드포인트가 없는 것이 의도다.** 계정은 운영 쪽에서 발급한다. 관리자 앱은
// 정의상 출소자 명단을 다루므로, 스스로 계정을 만드는 길을 열면 그게 곧 구멍이 된다.

export interface StaffLoginRequest {
  login_id: string;
  password: string;
}

export type StaffOrgKind =
  /** 한국법무보호복지공단 */
  | "koreha"
  /** 주민센터·행정복지센터 */
  | "center";

export interface StaffLoginResponse {
  staff_id: string;
  display_name: string;
  org_kind: StaffOrgKind;
  /** 소속 지부·센터 이름. */
  branch: string;
  /**
   * 이후 요청의 `Authorization: Bearer`에 싣는다.
   *
   * **기기에 저장하지 않는다.** 서버가 8시간까지 받아주는 것과 앱이 그동안 붙들고
   * 있는 것은 다른 문제다. 담당자 기기는 공용일 수 있어 새로고침하면 다시 로그인한다 (§8.2).
   */
  session_token: string;
}

export interface StaffMeResponse {
  staff_id: string;
  login_id: string;
  display_name: string;
  org_kind: StaffOrgKind;
  branch: string;
  /** 지부 필터가 켜져 있는지. "지금 무엇을 보고 있는지"를 화면에 알리는 데 쓴다. */
  branch_filter_on: boolean;
}

/** 화면에 내는 기관 이름. 서버 값(`koreha`·`center`)을 그대로 보여주지 않는다. */
export function orgKindLabel(kind: StaffOrgKind): string {
  return kind === "koreha" ? "한국법무보호복지공단" : "행정복지센터";
}
