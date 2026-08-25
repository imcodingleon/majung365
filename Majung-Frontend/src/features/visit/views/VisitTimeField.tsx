// 방문 시간 고르기 (§7.2).
//
// **가입 화면의 생일·출소날짜와 같은 방식이다.** 칸을 누르면 목록이 뜨고 고르면 닫힌다.
// 한 앱 안에서 값을 고르는 법이 여러 가지면 배워야 할 것이 그만큼 늘어난다.
//
// 예전에는 "8월 25일 화요일 오전"이 적힌 버튼 열 개를 늘어놓았다. 같은 말이 열 번
// 반복되어 무엇이 다른지 눈으로 갈리지 않았고, 1·2지망 두 벌이면 스무 개가 됐다.
//
// **오전·오후가 아니라 시각을 고른다.** 예전에는 오전을 10시, 오후를 3시로 대신 정해
// 보냈는데, 그 시각이 사용자가 고른 것이 아니면서도 담당자에게는 희망 시각으로 갔다.
import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { PickerBox, PickerSheet, type PickerItem } from "@/shared/components/PickerBox";
import { deferClose } from "@/shared/utils/deferClose";

import { type VisitTime, hoursOf, lastDayOf, monthsFrom, pickableDays } from "../domain/visitTime";

type Unit = "month" | "day" | "hour";

const UNIT_LABEL: Record<Unit, string> = { month: "월", day: "일", hour: "시" };
const SHEET_TITLE: Record<Unit, string> = {
  month: "몇 월에 가시나요",
  day: "며칠에 가시나요",
  hour: "몇 시에 가시나요",
};

type Props = {
  value: VisitTime;
  onChange: (next: VisitTime) => void;
  /** 낭독기 안내에 들어가는 이름. "가고 싶은 때"처럼 쓴다. */
  label: string;
  /** 오늘. 지난 날짜를 고르지 못하게 하는 기준이다. */
  today: Date;
  /** 다른 지망에서 이미 고른 때. 같은 때를 두 번 고르지 못하게 한다. */
  taken?: VisitTime | null;
};

export function VisitTimeField({ value, onChange, label, today, taken }: Props) {
  const [open, setOpen] = useState<Unit | null>(null);

  const months = useMemo(() => monthsFrom(today), [today]);
  const days = useMemo(
    () => pickableDays(value.year, value.month, today, taken ?? null),
    [value.year, value.month, today, taken],
  );
  const hours = useMemo(
    () => hoursOf(value.year, value.month, value.day, taken ?? null),
    [value.year, value.month, value.day, taken],
  );

  const items: readonly PickerItem[] =
    open === "month" ? months : open === "day" ? days : open === "hour" ? hours : [];
  const current = open === null ? null : (value[open] ?? null);

  const pick = (n: number) => {
    if (open === null) return;
    const next: VisitTime = { ...value, [open]: n };
    // 월을 고르면 그 달에 맞춰 년도 함께 정해진다. 12월 다음이 내년 1월이기 때문이다.
    if (open === "month") {
      next.year = months.find((m) => m.value === n)?.year ?? value.year;
      // 없는 날이 되면 그 달의 마지막 날로 당긴다. 손댄 적 없는 값이 틀린 채 남지 않는다.
      if (next.day && next.day > lastDayOf(next.year, n)) next.day = lastDayOf(next.year, n);
    }
    onChange(next);
    // 닫기를 미루지 않으면 이 클릭이 뒤 화면까지 누른다. deferClose 참고.
    const closing = open;
    deferClose(() => setOpen((cur) => (cur === closing ? null : cur)))();
  };

  // 앞 칸을 고르기 전에는 뒤 칸을 열지 않는다. 월을 모르면 며칠이 있는지도 모른다.
  const dayReady = Boolean(value.month);
  const hourReady = Boolean(value.day);

  return (
    <>
      <View className="flex-row gap-2">
        <PickerBox
          text={value.month ? String(value.month) : "--"}
          filled={Boolean(value.month)}
          unit="월"
          onPress={() => setOpen("month")}
          accessibilityLabel={
            value.month ? `${label} ${value.month}월. 눌러서 바꾸기` : `${label} 월 고르기`
          }
        />
        <PickerBox
          text={value.day ? String(value.day) : "--"}
          filled={Boolean(value.day)}
          unit="일"
          onPress={() => dayReady && setOpen("day")}
          accessibilityLabel={
            !dayReady
              ? `${label} 일 고르기. 먼저 월을 골라 주세요`
              : value.day
                ? `${label} ${value.day}일. 눌러서 바꾸기`
                : `${label} 일 고르기`
          }
        />
        <PickerBox
          text={value.hour ? String(value.hour) : "--"}
          filled={Boolean(value.hour)}
          unit="시"
          onPress={() => hourReady && setOpen("hour")}
          accessibilityLabel={
            !hourReady
              ? `${label} 시 고르기. 먼저 날짜를 골라 주세요`
              : value.hour
                ? `${label} ${value.hour}시. 눌러서 바꾸기`
                : `${label} 시 고르기`
          }
        />
      </View>

      {/* **왜 못 고르는 날이 있는지 미리 말한다.** 흐린 줄만 보이면 앱이 고장 난 줄 안다 */}
      <Text className="mt-2 text-caption text-ink-muted">
        주민센터와 공단은 평일 낮에만 문을 열어요. 점심시간은 빼 두었어요.
      </Text>

      <PickerSheet
        visible={open !== null}
        title={open ? SHEET_TITLE[open] : ""}
        items={items}
        current={current}
        unit={open ? UNIT_LABEL[open] : ""}
        onPick={pick}
        onClose={() => setOpen(null)}
      />
    </>
  );
}
