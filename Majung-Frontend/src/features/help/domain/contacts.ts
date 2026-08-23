// 상시 도움 연결 (§5.3). 이 번호들은 확정이며 별도 검증 절차를 두지 않는다.
// 번호만 나열하면 무엇을 눌러야 할지 또 판단해야 하므로, 무엇을 위한 번호인지 쉬운 말로 함께 적는다.

export type HelpLine = {
  /** 사용자에게 보이는 번호. */
  label: string;
  /** 실제 발신에 쓸 숫자만 남긴 번호. */
  dial: string;
  /** 언제 거는 번호인지. 쉬운 말로 쓴다. */
  when: string;
  /** 기관 이름. 번호만 있으면 어디에 거는지 알 수 없다. */
  org: string;
};

/** 상담 번호. 무엇을 말해야 하는지 묻지 않는다. */
export const COUNSEL_LINES: readonly HelpLine[] = [
  { label: "109", dial: "109", when: "마음이 많이 힘들 때", org: "자살예방 상담 · 24시간" },
  { label: "129", dial: "129", when: "생계나 복지가 급할 때", org: "보건복지상담센터" },
  { label: "1342", dial: "1342", when: "약물 문제로 도움이 필요할 때", org: "24시간" },
  {
    label: "1670-7004",
    dial: "16707004",
    when: "지원 신청이나 상담이 필요할 때",
    org: "한국법무보호복지공단",
  },
];

/** 긴급신고. 상담과 성격이 다르므로 화면에서도 영역을 나눈다. */
export const EMERGENCY_LINES: readonly HelpLine[] = [
  { label: "112", dial: "112", when: "위험한 일을 당했을 때", org: "경찰" },
  { label: "119", dial: "119", when: "크게 다치거나 불이 났을 때", org: "소방·구급" },
];
