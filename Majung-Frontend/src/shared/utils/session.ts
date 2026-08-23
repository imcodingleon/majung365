// 이번에 앱을 켜 있는 동안만 들고 있는 값.
//
// **아무 데도 저장하지 않는다.** 메모리에만 있으므로 앱을 닫으면 사라진다.
//
// 왜 이렇게 하나
//   - **URL 파라미터로 넘길 수 없다.** 초기 진단 답변에는 사는 곳·건강·빚 같은 사정이
//     들어 있고, 그것이 주소창에 남으면 안 된다
//   - **localStorage에 둘 수도 없다.** 평문으로 남으면 기기를 잡은 사람이 읽는다 (§2.4)
//
// **세션 토큰은 여기 두지 않는다.** 그것은 `tokenStore`가 기기 보안 저장소에 넣는다.
// 여기는 가입 화면에서 홈으로 값을 넘기는 통로일 뿐이며 앱을 닫으면 사라진다.
import type { IntakeAnswers } from "@/features/intake/domain/questionTypes";

import type { LocatedPlace } from "@/shared/location";

import type { IntakeAnswerMap, IntakeTask } from "../types";

type Session = {
  /** 서버로 보낸 형태(dataKey 기준). 할 일을 다시 계산할 때 쓴다. */
  answers: IntakeAnswerMap;
  /**
   * 문항 id 기준의 원본 답.
   *
   * 방문 알림에서 **답을 문장으로 만들려면** 어느 문항의 답인지 알아야 하는데,
   * 위의 `answers`는 서버가 쓰는 dataKey로 바뀐 뒤라 문항을 되짚을 수 없다.
   *
   * 이것도 메모리에만 있고 서버로 가지 않는다. 담당자에게 보낼 때만 그 순간의
   * 문장으로 만들어 방문 요청에 싣는다 (§7.4-1).
   */
  rawAnswers?: IntakeAnswers;
  /** 인사말에 쓸 이름. */
  name: string;
  /**
   * 가입 응답에 함께 온 할 일 목록.
   *
   * **가입 직후에는 서버를 다시 부르지 않는다.** 같은 답으로 같은 결과를 두 번 계산할
   * 이유가 없고, 그 사이 화면이 비어 있는 시간도 없어진다.
   */
  tasks?: readonly IntakeTask[];
  /**
   * 가입할 때 알아낸 지금 있는 곳 (§5.4).
   *
   * **여기 담기는 것은 좌표가 아니라 동 이름이다.** 좌표는 기기 안에서 동으로 바뀐
   * 직후에 버려지고 이 세션에도 오지 않는다.
   *
   * **저장하지 않는다.** 앱을 닫으면 사라지고 다시 물어본다 — 서버에 두면
   * 출소자 명단에 사는 동네가 붙는다.
   */
  place?: LocatedPlace;
};

let current: Session | null = null;

export function startSession(session: Session): void {
  current = session;
}

export function getSession(): Session | null {
  return current;
}

/** 모든 정보를 지웠을 때. 다음 화면은 가입부터 시작한다 (§9.4). */
export function endSession(): void {
  current = null;
}
