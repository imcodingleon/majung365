// 날짜 고르기 (§3.2 · §3.7).
//
// 가입 화면의 생일·출소일과 문항의 날짜가 **같은 방식으로 동작한다.** 한 앱 안에서 날짜를
// 고르는 법이 두 가지면 배워야 할 것이 둘로 늘어난다.
//
// 칸과 목록은 `PickerBox`가 맡는다 — 방문 시간 고르기(§7.2)도 같은 부품을 쓴다.
// 여기는 년·월·일이라는 조합과 그 조합에만 있는 규칙(없는 날짜 당기기)을 맡는다.
import { useMemo, useState } from "react";
import { View } from "react-native";

import { deferClose } from "@/shared/utils/deferClose";

import type { DateParts } from "../types/date";
import { PickerBox, PickerSheet, type PickerItem } from "./PickerBox";

type Props = {
  value: DateParts;
  onChange: (next: DateParts) => void;
  /** 화면에 읽히는 이름. "생일 년"처럼 낭독기 안내에 들어간다. */
  label: string;
  minYear: number;
  maxYear: number;
  /**
   * 아직 고른 적이 없을 때 년 목록이 서 있을 자리.
   *
   * 없으면 맨 위에서 시작하는데, 생일은 그 자리가 1930년이라 1970년대까지 마흔 번 넘게
   * 굴려야 한다. 흔한 값 근처에서 시작하면 대부분 몇 번만 움직이면 닿는다.
   */
  defaultYear: number;
};

/** 지금 어느 칸을 고르는 중인지. 닫혀 있으면 null. */
type Unit = "year" | "month" | "day";

const UNIT_LABEL: Record<Unit, string> = { year: "년", month: "월", day: "일" };

/** 그 달에 실제로 있는 날짜 수. 2월 30일 같은 값이 애초에 만들어지지 않는다. */
function daysIn(year: number, month: number): number {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

export function DateField({ value, onChange, label, minYear, maxYear, defaultYear }: Props) {
  /** 열려 있는 칸. 한 번에 하나만 고른다. */
  const [open, setOpen] = useState<Unit | null>(null);

  const years = useMemo(() => {
    const list: number[] = [];
    // 오래된 해가 위에 온다. 위에서 아래로 시간이 흐르는 순서가 달력과 같다.
    for (let y = minYear; y <= maxYear; y += 1) list.push(y);
    return list;
  }, [minYear, maxYear]);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const days = useMemo(() => {
    const count = daysIn(Number(value.year), Number(value.month));
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [value.year, value.month]);

  const numbers: readonly number[] = open === "year" ? years : open === "month" ? months : days;
  const items: PickerItem[] = numbers.map((n) => ({ value: n }));
  const current = open ? Number(value[open]) || null : null;

  // 고른 값이 없을 때 목록이 설 자리. 년만 흔한 값 근처에서 시작하고 월·일은 맨 위에서 시작한다.
  const restIndex = open === "year" ? Math.max(0, years.indexOf(defaultYear)) : 0;

  const pick = (n: number) => {
    if (open === null) return;
    const next = { ...value, [open]: String(n) };
    // 달을 바꿔 없는 날이 되면 그 달의 마지막 날로 당긴다. 손댄 적 없는 값이 틀린 채 남지 않는다.
    if (open !== "day" && next.day) {
      const last = daysIn(Number(next.year), Number(next.month));
      if (Number(next.day) > last) next.day = String(last);
    }
    onChange(next);
    // 닫기를 미루지 않으면 이 클릭이 뒤 화면의 죄목까지 누른다. deferClose 참고.
    //
    // **그 사이에 다른 칸이 열렸으면 건드리지 않는다.** 미룬 닫기가 뒤늦게 돌면서
    // 방금 연 팝업을 닫아 버리면, 제목도 단위도 없는 빈 목록이 남는다.
    const closing = open;
    deferClose(() => setOpen((cur) => (cur === closing ? null : cur)))();
  };

  return (
    <>
      <View className="flex-row gap-2">
        <PickerBox
          text={value.year || "----"}
          filled={Boolean(value.year)}
          unit="년"
          onPress={() => setOpen("year")}
          accessibilityLabel={
            value.year ? `${label} ${value.year}년. 눌러서 바꾸기` : `${label} 년 고르기`
          }
        />
        <PickerBox
          text={value.month ? String(Number(value.month)) : "--"}
          filled={Boolean(value.month)}
          unit="월"
          onPress={() => setOpen("month")}
          accessibilityLabel={
            value.month
              ? `${label} ${Number(value.month)}월. 눌러서 바꾸기`
              : `${label} 월 고르기`
          }
        />
        <PickerBox
          text={value.day ? String(Number(value.day)) : "--"}
          filled={Boolean(value.day)}
          unit="일"
          onPress={() => setOpen("day")}
          accessibilityLabel={
            value.day ? `${label} ${Number(value.day)}일. 눌러서 바꾸기` : `${label} 일 고르기`
          }
        />
      </View>

      <PickerSheet
        visible={open !== null}
        title={open ? `${UNIT_LABEL[open]}을 고르세요` : ""}
        items={items}
        current={current}
        unit={open ? UNIT_LABEL[open] : ""}
        restIndex={restIndex}
        onPick={pick}
        onClose={() => setOpen(null)}
      />
    </>
  );
}
