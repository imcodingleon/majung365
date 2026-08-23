// 죄목 대분류 (§3.3).
//
// 분류 체계에서 온 선택지라 1인칭이 아니라 명사형을 유지한다. 1인칭으로 바꾸면
// **자기 죄를 스스로 진술하게 만드는 문장**이 되며, 이것은 이 서비스가 가장 피해야 할 일이다.
//
// 가입 화면과 내 정보 화면이 함께 쓰는 값이라 shared에 둔다.
export type CrimeCategoryId =
  | "violent"
  | "sexual"
  | "property"
  | "drug"
  | "other"
  | "undisclosed";

export type CrimeCategory = {
  id: CrimeCategoryId;
  label: string;
};

export const CRIME_CATEGORIES: readonly CrimeCategory[] = [
  { id: "violent", label: "폭력·강력범죄" },
  { id: "sexual", label: "성범죄" },
  { id: "property", label: "재산·경제범죄" },
  { id: "drug", label: "마약·중독범죄" },
  { id: "other", label: "기타범죄" },
  // 다른 선택지가 명사형인데 이것만 문장형인 것은 의도한 것이다. 성격이 다르므로 눈에 구별되어야 한다.
  // "답변 거부"는 취조받는 어감을 주고, "생략"은 무엇을 생략하는지 사용자가 판단해야 한다.
  { id: "undisclosed", label: "말하고 싶지 않아요" },
];

/** 죄목을 밝힌 경우에만 죄목 동의 항목이 필요하다. */
export function needsCrimeConsent(crime: CrimeCategoryId | null): boolean {
  return crime !== null && crime !== "undisclosed";
}
