// 날짜 적기 (§3.2 · §3.7).
//
// 가입 화면의 생일·출소일과 문항의 날짜가 **같은 방식으로 동작한다.** 한 앱 안에서 날짜를
// 적는 법이 두 가지면 배워야 할 것이 둘로 늘어난다.
//
// **눌러서 고르는 방식에서 키보드로 적는 방식으로 바꿨다** (2026-08-31 · 디자이너 권고).
// 생년월일은 사용자가 이미 외우고 있는 값이라 적는 편이 빠르다. 고르는 방식에서는
// 1930년부터 시작하는 목록을 마흔 번 넘게 굴려야 1970년대에 닿았다.
// 내 정보의 생일 확인 화면(`BirthGate`)이 이미 이 방식이라, 앱 안에서 생일을 적는
// 자리가 하나로 모인다.
//
// **키보드로 바뀌면서 없던 문제가 생긴다.** 고르는 방식에서는 2월 30일이나 3000년을
// 애초에 고를 수 없었지만, 적는 방식에서는 적을 수 있다. 그래서 여기가 직접 판정하고
// 무엇이 잘못됐는지 한 줄로 알린다 — 판정만 하고 말하지 않으면 시작하기 버튼이 왜
// 켜지지 않는지 사용자가 알 수 없다.
//
// **커서를 다음 칸으로 옮기지 않는다.** 년 네 자리를 채우면 자동으로 월로 넘어가게 할 수
// 있지만, 손대지 않은 커서가 저 혼자 움직이면 어디에 적고 있는지 놓치기 쉽다.
import { Text, TextInput, View } from "react-native";

import { COLORS } from "../theme/colors";
import { isValidDate, type DateParts } from "../types/date";

type Props = {
  value: DateParts;
  onChange: (next: DateParts) => void;
  /** 화면에 읽히는 이름. "생일 년"처럼 낭독기 안내에 들어간다. */
  label: string;
  minYear: number;
  maxYear: number;
  /**
   * 년 칸에 흐리게 비치는 예시 값.
   *
   * 고르는 방식이던 때에는 목록이 서 있을 자리였다. 적는 방식에서는 **네 자리로 적는
   * 자리**임을 보이는 일을 맡는다 — "----"만 있으면 두 자리로 적는 사람이 나온다.
   */
  defaultYear: number;
};

/** 숫자만 남기고 자릿수를 자른다. 문자를 걸러내지 않으면 검사에서만 막혀 이유를 알 수 없다. */
function digits(text: string, max: number): string {
  return text.replace(/\D/g, "").slice(0, max);
}

function DateBox({
  value,
  onChangeText,
  unit,
  placeholder,
  maxLength,
  accessibilityLabel,
  invalid,
}: {
  value: string;
  onChangeText: (t: string) => void;
  unit: string;
  placeholder: string;
  maxLength: number;
  accessibilityLabel: string;
  invalid: boolean;
}) {
  const filled = value !== "";
  // 채워진 칸은 테두리가 진해진다 (시안). 어디까지 적었는지 색으로 먼저 읽힌다.
  const border = invalid ? COLORS.alert : filled ? COLORS.brand : COLORS.line;

  return (
    <View
      className="flex-1 flex-row items-center justify-center gap-1 rounded-xl border-[1.5px] bg-white px-2 py-4"
      style={{ borderColor: border }}
    >
      {/* **`min-w-0`이 없으면 안 된다.** 웹에서 flex 칸의 최소 폭은 기본이 `auto`라
          입력칸이 부모보다 넓게 잡히고, 적은 숫자와 단위 글자가 통째로 상자 밖으로
          밀려나 빈 상자만 보인다. 네이티브에는 아무 영향이 없다 */}
      <TextInput
        className="min-w-0 flex-1 text-title font-medium text-ink-strong"
        style={{ textAlign: "right" }}
        value={value}
        onChangeText={(t) => onChangeText(digits(t, maxLength))}
        keyboardType="number-pad"
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor={COLORS.inkMuted}
        accessibilityLabel={accessibilityLabel}
      />
      <Text
        className="text-title"
        style={{ color: filled ? COLORS.inkStrong : COLORS.inkMuted }}
      >
        {unit}
      </Text>
    </View>
  );
}

export function DateField({ value, onChange, label, minYear, maxYear, defaultYear }: Props) {
  const set = (unit: keyof DateParts, next: string) => onChange({ ...value, [unit]: next });

  // **다 적기 전에는 나무라지 않는다.** 년을 두 자리 적은 중간 상태를 틀렸다고 하면
  // 적는 내내 빨간 표시를 보게 된다.
  const complete = value.year.length === 4 && value.month !== "" && value.day !== "";
  const realDate = complete && isValidDate(value);
  const inRange =
    complete && Number(value.year) >= minYear && Number(value.year) <= maxYear;

  // **범위를 먼저 본다.** 1800년은 실제로 있는 해인데 `isValidDate`가 1900년 미만을
  // 거부하기 때문에, 순서를 뒤집으면 "실제로 있는 날짜를 입력해 주세요"라는 틀린 말이 나온다.
  const problem = !complete
    ? null
    : !inRange
      ? `${minYear}년부터 ${maxYear}년 사이로 입력해 주세요.`
      : !realDate
        ? "실제로 있는 날짜를 입력해 주세요."
        : null;

  return (
    <View>
      <View className="flex-row gap-2">
        <DateBox
          value={value.year}
          onChangeText={(t) => set("year", t)}
          unit="년"
          placeholder={String(defaultYear)}
          maxLength={4}
          accessibilityLabel={`${label} 년. 네 자리로 적어 주세요`}
          invalid={Boolean(problem)}
        />
        <DateBox
          value={value.month}
          onChangeText={(t) => set("month", t)}
          unit="월"
          placeholder="--"
          maxLength={2}
          accessibilityLabel={`${label} 월`}
          invalid={Boolean(problem)}
        />
        <DateBox
          value={value.day}
          onChangeText={(t) => set("day", t)}
          unit="일"
          placeholder="--"
          maxLength={2}
          accessibilityLabel={`${label} 일`}
          invalid={Boolean(problem)}
        />
      </View>

      {problem ? (
        <Text className="mt-2 text-caption font-medium" style={{ color: COLORS.alert }}>
          {problem}
        </Text>
      ) : null}
    </View>
  );
}
