// **전역이 아니라 가져와서 쓴다.** `expo/tsconfig.base`가 `types`를 좁혀 두어
// `describe`·`it`·`expect`가 전역으로 잡히지 않는다.
import { describe, expect, it } from "@jest/globals";

import type { CrimeCategoryId } from "@/shared/types/crime";

import { toSignupRequest } from "./signup";

/**
 * 여기가 화면과 서버가 만나는 자리다.
 *
 * 이 함수가 만드는 것이 그대로 `POST /api/signup`의 본문이 되고, 서버는 그 값으로
 * 안내를 개인화한다. **값이 하나만 어긋나도 개인화가 통째로 죽는데, 화면에는
 * 아무 오류도 뜨지 않는다** — 안내가 없는 것과 구별되지 않기 때문이다.
 */

const BIRTH = { year: "1975", month: "03", day: "02" };
const RELEASE = { year: "2026", month: "08", day: "03" };

function build(crime: CrimeCategoryId | null, agreed = true) {
  return toSignupRequest({
    name: "김판수",
    birth: BIRTH,
    releaseDate: RELEASE,
    crime,
    consent: { privacy: true, crime: agreed, share: false, location: true },
    answers: { bankAccountStatus: "NONE" },
  });
}

describe("toSignupRequest — 수용 사유 전달", () => {
  it("고른 대분류를 서버가 아는 값으로 보낸다", () => {
    // 백엔드 `CRIME_CATEGORIES`와 같은 문자열이어야 한다. 다르면 422로 막히거나
    // 조용히 안내가 안 붙는다.
    expect(build("property")?.crime_category).toBe("property");
    expect(build("sexual")?.crime_category).toBe("sexual");
    expect(build("drug")?.crime_category).toBe("drug");
  });

  it("말하지 않기로 하면 필드 자체를 만들지 않는다", () => {
    // **"말하지 않음"을 값으로 저장하면 그것도 하나의 기록이 된다** (§9.1).
    const request = build("undisclosed");

    expect(request).not.toBeNull();
    expect("crime_category" in request!).toBe(false);
  });

  it("아무것도 고르지 않아도 필드를 만들지 않는다", () => {
    expect("crime_category" in build(null)!).toBe(false);
  });

  it("대분류를 고르면 그 동의도 함께 간다", () => {
    // 민감정보를 받아 놓고 동의가 없으면 서버가 저장하지 않는다 (§3.4 조건부 필수).
    const kinds = build("property")!.consents.map((c) => c.kind);

    expect(kinds).toContain("crime");
  });

  it("말하지 않기로 하면 그 동의도 보내지 않는다", () => {
    // 화면에 보이지 않은 동의는 담지 않는다. 받지 않은 정보에 동의가 남으면 안 된다.
    const kinds = build("undisclosed")!.consents.map((c) => c.kind);

    expect(kinds).not.toContain("crime");
  });

  it("위치 동의는 서버로 보내지 않는다", () => {
    // 위치를 모으지도 보내지도 않으므로 서버가 기록할 대상이 없다.
    // 보내면 "무언가 수집한다"는 잘못된 기록이 남는다.
    const kinds = build("property")!.consents.map((c) => c.kind);

    expect(kinds).not.toContain("location");
  });

  it("날짜가 유효하지 않으면 아무것도 만들지 않는다", () => {
    const broken = toSignupRequest({
      name: "김판수",
      birth: { year: "", month: "", day: "" },
      releaseDate: RELEASE,
      crime: "property",
      consent: { privacy: true, crime: true, share: false, location: false },
      answers: {},
    });

    expect(broken).toBeNull();
  });
});
