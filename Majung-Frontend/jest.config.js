// **계산만 테스트한다.** 화면은 타입 검사와 눈으로 확인한다.
//
// 화면 테스트 도구(React Native Testing Library)를 넣지 않은 것은 선택이다. 이번에
// 막으려는 것은 알림 건수나 목록 순서처럼 **틀려도 오류가 나지 않고 숫자만 조용히
// 어긋나는** 종류이고, 그것은 순수 함수 자리에 모여 있다.
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
};
