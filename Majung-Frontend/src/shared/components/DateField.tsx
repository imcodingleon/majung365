// 날짜 고르기 (§3.2 · §3.7).
//
// 가입 화면의 생일·출소일과 문항의 날짜가 **같은 방식으로 동작한다.** 한 앱 안에서 날짜를
// 고르는 법이 두 가지면 배워야 할 것이 둘로 늘어난다.
//
// 숫자 칸 세 개를 직접 채우게 하던 방식을 눌러서 고르는 방식으로 바꿨다.
// 키보드가 올라오지 않고, 없는 날짜를 만들 수 없으며, 한 번에 한 가지만 고르면 된다.
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
  /** 화면에 읽히는 이름. "생일을 고르세요"처럼 안내에 그대로 들어간다. */
  label: string;
  minYear: number;
  maxYear: number;
  /**
   * 아직 고른 적이 없을 때 목록이 서 있을 자리.
   *
   * 없으면 맨 위에서 시작하는데, 생일은 그 자리가 올해라 1970년대까지 쉰 번 넘게 굴려야 한다.
   * 흔한 값 근처에서 시작하면 대부분 몇 번만 움직이면 닿는다.
   */
  defaultYear: number;
};

/** 한 줄 높이. 초기 위치를 픽셀로 계산해야 해서 고정한다. */
const ROW = 46;

/** 그 달에 실제로 있는 날짜 수. 2월 30일 같은 값이 애초에 만들어지지 않는다. */
function daysIn(year: number, month: number): number {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

function isFilled(v: DateParts): boolean {
  return Boolean(v.year && v.month && v.day);
}

/** 고른 값을 사람이 읽는 순서로 낸다. */
function readable(v: DateParts): string {
  return `${v.year}년 ${Number(v.month)}월 ${Number(v.day)}일`;
}

function Column({
  items,
  selected,
  onSelect,
  unit,
  accessibilityLabel,
  restIndex,
}: {
  items: readonly number[];
  selected: number | null;
  onSelect: (n: number) => void;
  unit: string;
  accessibilityLabel: string;
  /** 고른 값이 없을 때 목록이 서 있을 자리. */
  restIndex: number;
}) {
  const at = selected === null ? restIndex : items.indexOf(selected);
  // 고른 줄이 위에 딱 붙지 않고 한 줄쯤 위가 함께 보이게 둔다. 앞뒤가 보여야 목록으로 읽힌다.
  const offset = Math.max(0, (at < 0 ? restIndex : at) - 1) * ROW;

  // 처음 그려질 때 한 번만 자리를 잡는다. 그 뒤로는 사용자가 굴린 자리를 건드리지 않는다.
  // `contentOffset`으로는 안 된다. 웹의 ScrollView가 그 속성을 무시한다.
  const listRef = useRef<ScrollView>(null);
  const placed = useRef(false);

  return (
    <View className="flex-1">
      <Text className="mb-2 text-center text-[13px] font-bold text-ink-muted">{unit}</Text>
      <ScrollView
        className="h-64 rounded-2xl border-[1.5px] border-line bg-page"
        contentContainerClassName="py-1.5"
        accessibilityLabel={accessibilityLabel}
        showsVerticalScrollIndicator={false}
        ref={listRef}
        onContentSizeChange={() => {
          if (placed.current) return;
          placed.current = true;
          listRef.current?.scrollTo({ y: offset, animated: false });
        }}
      >
        {items.map((n) => {
          const on = n === selected;
          return (
            <Pressable
              key={n}
              onPress={() => onSelect(n)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${n}${unit}`}
              className="mx-1.5 items-center justify-center rounded-xl active:opacity-70"
              style={{ height: ROW - 4, marginVertical: 2, backgroundColor: on ? COLORS.brand : "transparent" }}
            >
              <Text
                className="text-[19px]"
                style={{
                  color: on ? COLORS.surface : COLORS.inkStrong,
                  fontWeight: on ? "800" : "600",
                }}
              >
                {n}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function DateField({ value, onChange, label, minYear, maxYear, defaultYear }: Props) {
  const [open, setOpen] = useState(false);
  // 팝업 안에서 고르는 동안의 값. 취소하면 원래 값이 그대로 남는다.
  const [draft, setDraft] = useState<DateParts>(value);

  // 오래된 해가 위에 온다. 위에서 아래로 시간이 흐르는 순서가 달력과 같고, 어느 쪽이 위인지
  // 헷갈리지 않는다. 대신 목록은 흔한 값 근처에 서서 시작한다.
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = minYear; y <= maxYear; y += 1) list.push(y);
    return list;
  }, [minYear, maxYear]);

  const yearRest = Math.max(0, years.indexOf(defaultYear));

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const days = useMemo(() => {
    const count = daysIn(Number(draft.year), Number(draft.month));
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [draft.year, draft.month]);

  const draftReady = isFilled(draft);

  const start = () => {
    setDraft(value);
    setOpen(true);
  };

  const confirm = () => {
    onChange(draft);
    setOpen(false);
  };

  /** 달을 바꿔 없는 날짜가 되면 그 달의 마지막 날로 당긴다. 사용자가 고친 적 없는 값이 틀린 채 남지 않는다. */
  const pickMonth = (m: number) => {
    setDraft((prev) => {
      const last = daysIn(Number(prev.year), m);
      const day = prev.day && Number(prev.day) > last ? String(last) : prev.day;
      return { ...prev, month: String(m), day };
    });
  };

  return (
    <>
      <Pressable
        onPress={start}
        accessibilityRole="button"
        accessibilityLabel={
          isFilled(value) ? `${label} ${readable(value)}. 눌러서 바꾸기` : `${label} 고르기`
        }
        className="flex-row items-center rounded-xl border-[1.5px] bg-white px-4 py-4 active:opacity-80"
        style={{ borderColor: isFilled(value) ? COLORS.brand : COLORS.line }}
      >
        <Text
          className="flex-1 text-[17px]"
          style={{
            color: isFilled(value) ? COLORS.inkStrong : COLORS.inkMuted,
            fontWeight: isFilled(value) ? "700" : "500",
          }}
        >
          {isFilled(value) ? readable(value) : "눌러서 고르기"}
        </Text>
        <Text className="text-[15px] font-bold" style={{ color: COLORS.brand }}>
          {isFilled(value) ? "바꾸기" : "고르기"}
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="rounded-t-3xl bg-white px-5 pb-8 pt-5">
            <Text className="text-[19px] font-extrabold text-ink-strong">{label}</Text>
            <Text className="mb-4 mt-1 text-[15px] text-ink-sub">
              {draftReady ? readable(draft) : "년, 월, 일을 차례로 골라 주세요."}
            </Text>

            <View className="flex-row gap-2.5">
              <Column
                items={years}
                selected={draft.year ? Number(draft.year) : null}
                onSelect={(y) => setDraft((prev) => ({ ...prev, year: String(y) }))}
                unit="년"
                accessibilityLabel={`${label} 년 고르기`}
                restIndex={yearRest}
              />
              <Column
                items={months}
                selected={draft.month ? Number(draft.month) : null}
                onSelect={pickMonth}
                unit="월"
                accessibilityLabel={`${label} 월 고르기`}
                restIndex={0}
              />
              <Column
                items={days}
                selected={draft.day ? Number(draft.day) : null}
                onSelect={(d) => setDraft((prev) => ({ ...prev, day: String(d) }))}
                unit="일"
                accessibilityLabel={`${label} 일 고르기`}
                restIndex={0}
              />
            </View>

            <View className="mt-5 flex-row gap-2.5">
              <Pressable
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="그만두기"
                className="flex-1 items-center rounded-2xl border-[1.5px] border-line py-4 active:opacity-80"
              >
                <Text className="text-[17px] font-bold text-ink-sub">그만두기</Text>
              </Pressable>
              <Pressable
                onPress={confirm}
                disabled={!draftReady}
                accessibilityRole="button"
                accessibilityState={{ disabled: !draftReady }}
                accessibilityLabel="다 골랐어요"
                className="flex-[1.4] items-center rounded-2xl py-4 active:opacity-90"
                style={{ backgroundColor: draftReady ? COLORS.brand : COLORS.brandMuted }}
              >
                <Text className="text-[17px] font-extrabold text-white">다 골랐어요</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
