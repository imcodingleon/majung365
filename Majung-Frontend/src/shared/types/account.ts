// 가입·내 정보 계약 미러 (§2.4·§2.5·§9.4).
//
// 정본: Majung-Backend — POST /api/signup · GET·PATCH·DELETE /api/me
import type { CrimeCategoryId } from "./crime";
import type { IntakeAnswerMap, IntakeTask } from "./intake";

/** 동의 항목 하나. `kind`는 화면의 동의 id와 같은 값이다. */
export interface ConsentInput {
  kind: "privacy" | "crime" | "share";
  agreed: boolean;
}

export interface SignupRequest {
  name: string;
  /** YYYY-MM-DD */
  birth_date: string;
  release_date: string;
  /**
   * 화면에 보인 문항의 답만 담는다 (§3.8).
   * **사라진 답을 채워 보내면 사용자가 철회한 정보를 되살리는 셈이다.**
   */
  answers: IntakeAnswerMap;
  /**
   * 동의 기록. **`crime`은 죄목을 밝힌 경우에만 온다.**
   * 셋이 항상 다 있다고 가정하지 않는다.
   */
  consents: ConsentInput[];
  /**
   * 죄목 대분류. 말하지 않기로 한 경우에는 **이 필드 자체가 없다.**
   *
   * `undisclosed`를 값으로 보내지 않는다 — 말하지 않겠다고 한 것을 "말하지 않음"이라는
   * 값으로 저장하면 그것도 하나의 기록이 된다 (§9.1 데이터 최소화).
   */
  crime_category?: Exclude<CrimeCategoryId, "undisclosed">;
}

export interface SignupResponse {
  user_id: string;
  /** **다시 조회할 수 없다.** 받는 즉시 보관해야 한다. */
  session_token: string;
  /** 가입과 동시에 계산되어 온다. 이 값이 있으면 intake/analyze를 다시 부르지 않는다. */
  tasks: IntakeTask[];
}

export interface MeResponse {
  user_id: string;
  name: string;
  birth_date: string;
  release_date: string;
  /** 출소한 지 며칠 됐는지. 서버가 세어 준다. */
  days_since_release: number;
  /**
   * 죄목을 저장해 두었는지.
   *
   * **값 자체는 내려오지 않는다.** 화면에 띄우면 어깨 너머로 보인다. 무엇을 지울 수
   * 있는지만 알면 된다 (§2.5).
   */
  has_crime_category: boolean;
  /**
   * 마지막으로 알아낸 자리 (2026-08-26 결정 F-1). 알린 적이 없으면 없다.
   *
   * **이것이 있어야 다른 기기에서도 지도가 그 자리를 기준으로 뜬다.** 같은 기기라면
   * localStorage에 남은 값으로 충분하지만, 브라우저를 지웠거나 기기를 바꾸면 그쪽은
   * 비어 있다.
   */
  place?: PlaceResponse | null;
}

/** 서버가 아는 자리. 지역을 직접 고른 경우에는 좌표가 없다. */
export interface PlaceResponse {
  sido: string;
  district: string;
  dong: string;
  lat?: number | null;
  lng?: number | null;
}

/** 바꿀 항목만 담는다. 죄목은 고칠 수 없고 철회만 된다. */
export interface UpdateMeRequest {
  name?: string;
  birth_date?: string;
  release_date?: string;
  /** 참이면 죄목이 즉시 파기된다 (§9.5). */
  crime_category_revoked?: boolean;
  /**
   * 새로 알아낸 자리 (2026-08-26 결정 F-1). **이력이 아니라 마지막 한 자리만 남는다.**
   *
   * 지역을 직접 고른 경우에는 좌표 없이 시군구만 보낸다.
   */
  place?: {
    sido: string;
    district: string;
    dong?: string;
    lat?: number;
    lng?: number;
  };
  /**
   * 새로 밝히는 죄목 대분류. 처음에는 말하지 않다가 나중에 밝힐 수 있다 (§3.3-3).
   *
   * **`crime_consent_agreed` 없이 보내면 서버가 거절한다.** 민감정보를 동의 없이
   * 저장하는 경로는 하나도 열어두지 않는다 (§9.5).
   */
  crime_category?: string;
  /** 이 요청과 함께 받은 민감정보 동의. */
  crime_consent_agreed?: boolean;
}

/**
 * `GET /api/tasks` 응답 — 세션을 되살렸을 때 오는 것.
 *
 * **진단 답변은 오지 않는다.** 서버에 저장된 것이 판정뿐이기 때문이다 (§9.1).
 * 그래서 이 응답으로는 할 일을 다시 계산할 수 없고, 계산은 서버가 이미 마쳤다.
 */
export interface RestoreResponse {
  name: string;
  tasks: IntakeTask[];
  /** 마친 지원 항목의 번호들. */
  completed: string[];
}
