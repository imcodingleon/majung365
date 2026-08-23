// 날짜 고르기 (§3.2 · §3.7).
//
// 가입 화면의 생일·출소일과 문항의 날짜가 **같은 방식으로 동작한다.** 한 앱 안에서 날짜를
// 고르는 법이 두 가지면 배워야 할 것이 둘로 늘어난다.
//
// 년·월·일 세 칸이 화면에 그대로 보이고, 각 칸을 누르면 그 하나만 고르는 목록이 뜬다.
// 칸을 눌러 하나를 고르면 바로 닫힌다. 고를 것이 하나뿐인 자리에 확인 버튼을 두면
// 누를 것이 두 번으로 늘어난다.
//
// **직접 만든다.** 날짜 선택기 라이브러리는 웹과 안드로이드·iOS에서 각각 다른 화면을 띄우는데,
// 그러면 저리터러시 사용자가 만나는 화면을 우리가 통제하지 못한다. 여기서는 세 화면이 같아야 한다.
import { useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { COLORS } from "../theme/colors";
import type { DateParts } from "../types/date";

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

/** 목록 한 줄 높이. 처음 설 자리를 픽셀로 계산해야 해서 고정한다. */
const ROW = 52;

/** 그 달에 실제로 있는 날짜 수. 2월 30일 같은 값이 애초에 만들어지지 않는다. */
function daysIn(year: number, month: number): number {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

function Box({
  text,
  filled,
  unit,
  onPress,
  accessibilityLabel,
}: {
  text: string;
  filled: boolean;
  unit: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="flex-1 flex-row items-center justify-center gap-1 rounded-xl border-[1.5px] bg-white px-2 py-4 active:opacity-80"
      style={{ borderColor: filled ? COLORS.brand : COLORS.line }}
    >
      <Text
        className="text-body-lg"
        style={{
          color: filled ? COLORS.inkStrong : COLORS.inkMuted,
          fontWeight: filled ? "700" : "500",
        }}
      >
        {text}
      </Text>
      <Text className="text-body" style={{ color: filled ? COLORS.inkSub : COLORS.inkMuted }}>
        {unit}
      </Text>
    </Pressable>
  );
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

  const items: readonly number[] = open === "year" ? years : open === "month" ? months : days;
  const current = open ? Number(value[open]) || null : null;

  // 고른 값이 없을 때 목록이 설 자리. 년만 흔한 값 근처에서 시작하고 월·일은 맨 위에서 시작한다.
  const restIndex = open === "year" ? Math.max(0, years.indexOf(defaultYear)) : 0;
  const at = current === null ? restIndex : items.indexOf(current);
  // 고른 줄이 위에 딱 붙지 않고 한 줄쯤 위가 함께 보이게 둔다. 앞뒤가 보여야 목록으로 읽힌다.
  const offset = Math.max(0, (at < 0 ? restIndex : at) - 1) * ROW;

  // 처음 그려질 때 한 번만 자리를 잡는다. `contentOffset`으로는 안 된다 — 웹의 ScrollView가
  // 그 속성을 무시한다.
  const listRef = useRef<ScrollView>(null);
  const placed = useRef(false);

  const openUnit = (unit: Unit) => {
    placed.current = false;
    setOpen(unit);
  };

  const pick = (n: number) => {
    if (open === null) return;
    const next = { ...value, [open]: String(n) };
    // 달을 바꿔 없는 날이 되면 그 달의 마지막 날로 당긴다. 손댄 적 없는 값이 틀린 채 남지 않는다.
    if (open !== "day" && next.day) {
      const last = daysIn(Number(next.year), Number(next.month));
      if (Number(next.day) > last) next.day = String(last);
    }
    onChange(next);
    setOpen(null);
  };

  return (
    <>
      <View className="flex-row gap-2">
        <Box
          text={value.year || "----"}
          filled={Boolean(value.year)}
          unit="년"
          onPress={() => openUnit("year")}
          accessibilityLabel={
            value.year ? `${label} ${value.year}년. 눌러서 바꾸기` : `${label} 년 고르기`
          }
        />
        <Box
          text={value.month ? String(Number(value.month)) : "--"}
          filled={Boolean(value.month)}
          unit="월"
          onPress={() => openUnit("month")}
          accessibilityLabel={
            value.month
              ? `${label} ${Number(value.month)}월. 눌러서 바꾸기`
              : `${label} 월 고르기`
          }
        />
        <Box
          text={value.day ? String(Number(value.day)) : "--"}
          filled={Boolean(value.day)}
          unit="일"
          onPress={() => openUnit("day")}
          accessibilityLabel={
            value.day ? `${label} ${Number(value.day)}일. 눌러서 바꾸기` : `${label} 일 고르기`
          }
        />
      </View>

      <Modal visible={open !== null} animationType="slide" transparent onRequestClose={() => setOpen(null)}>
        {/* 바깥을 눌러도 닫힌다. 고르지 않고 빠져나올 길이 있어야 한다.
            바깥과 시트를 형제로 둔다 — 겹쳐 두면 버튼 안에 버튼이 들어가 웹에서 깨진다. */}
        <View className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-black/40"
            onPress={() => setOpen(null)}
            accessibilityRole="button"
            accessibilityLabel="닫기"
          />
          <View className="rounded-t-3xl bg-white px-5 pb-8 pt-5">
            <View className="mb-4 flex-row items-center">
              <Text className="flex-1 text-heading font-extrabold text-ink-strong">
                {open ? `${UNIT_LABEL[open]}을 고르세요` : ""}
              </Text>
              <Pressable
                onPress={() => setOpen(null)}
                accessibilityRole="button"
                accessibilityLabel="닫기"
                className="size-9 items-center justify-center rounded-full active:opacity-70"
              >
                <Text className="text-2xl text-ink-muted">✕</Text>
              </Pressable>
            </View>

            <ScrollView
              className="h-80 rounded-2xl border-[1.5px] border-line bg-page"
              contentContainerClassName="py-1.5"
              showsVerticalScrollIndicator={false}
              ref={listRef}
              onContentSizeChange={() => {
                if (placed.current) return;
                placed.current = true;
                listRef.current?.scrollTo({ y: offset, animated: false });
              }}
            >
              {items.map((n) => {
                const on = n === current;
                return (
                  <Pressable
                    key={n}
                    onPress={() => pick(n)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${n}${open ? UNIT_LABEL[open] : ""}`}
                    className="mx-1.5 items-center justify-center rounded-xl active:opacity-70"
                    style={{
                      height: ROW - 4,
                      marginVertical: 2,
                      backgroundColor: on ? COLORS.brand : "transparent",
                    }}
                  >
                    <Text
                      className="text-title"
                      style={{
                        color: on ? COLORS.surface : COLORS.inkStrong,
                        fontWeight: on ? "800" : "600",
                      }}
                    >
                      {n}
                      {open ? UNIT_LABEL[open] : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
