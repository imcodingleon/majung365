// 상황 알아보기 — 6분야 (§3.7).
//
// 세로로 쌓인 아코디언에서 **두 칸씩 세 줄의 격자**로 바꿨다. 여섯 개가 한눈에 들어와야
// 얼마나 남았는지 짐작할 수 있다. 세로로 쌓으면 아래 두 개는 스크롤해야 보이고,
// 그러면 끝이 없는 목록처럼 보인다.
//
// 박스를 누르면 문항 팝업이 열린다. 이 자리에서 펼치지 않는다. 한 화면에 한 가지가 원칙이다.
import { Pressable, Text, View } from "react-native";
import { Icon } from "@/shared/components/Icon";

import { COLORS } from "@/shared/theme/colors";

import { doneSectionCount, isSectionDone, type IntakeProgress } from "../domain/progress";
import { SECTIONS, type SectionId } from "../domain/sections";

import { SectionIcon } from "./SectionIcon";

type Props = {
  progress: IntakeProgress;
  /** 박스를 눌렀을 때. 라우트가 문항 팝업을 연다. */
  onOpen: (id: SectionId) => void;
};

function SectionBox({
  id,
  label,
  answered,
  visible,
  done,
  onOpen,
}: {
  id: SectionId;
  label: string;
  answered: number;
  visible: number;
  done: boolean;
  onOpen: () => void;
}) {
  // 진행 표시는 **답한 것이 하나라도 있을 때** 나온다. 문항 수는 열어보기 전에도 알 수 있지만,
  // 손대지 않은 박스에 "4개 중 0개"가 붙으면 여섯 개 모두 못 한 일처럼 보인다.
  const started = answered > 0;
  const ratio = visible > 0 ? Math.min(1, answered / visible) : 0;

  const border = done ? COLORS.doneLine : started ? COLORS.brand : COLORS.lineStrong;
  const tint = done ? COLORS.doneBg : COLORS.surface;
  const accent = done ? COLORS.doneInk : COLORS.brand;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={
        done
          ? `${label}. 다 답하셨어요. 눌러서 고치기`
          : started
            ? `${label}. ${visible}개 중 ${answered}개 답하셨어요. 눌러서 이어서 답하기`
            : `${label}. 눌러서 답하기`
      }
      className="w-[48.5%] rounded-2xl border-[1.5px] px-4 pb-4 pt-4 active:opacity-85"
      style={{ backgroundColor: tint, borderColor: border }}
    >
      <View
        className="size-12 items-center justify-center rounded-2xl"
        style={{ backgroundColor: done ? COLORS.surface : COLORS.brandSoft }}
      >
        <SectionIcon id={id} size={26} color={accent} />
      </View>

      <Text
        className="mt-3 text-body-lg font-extrabold"
        style={{ color: done ? COLORS.doneInk : COLORS.inkStrong }}
      >
        {label}
      </Text>

      <View className="mt-1 flex-row items-center justify-center gap-1">
        {done ? <Icon name="check" size={14} color={COLORS.doneInk} /> : null}
        <Text
          className="text-caption font-bold"
          style={{ color: done ? COLORS.doneInk : COLORS.inkMuted }}
        >
          {done ? "다 답했어요" : started ? `${visible}개 중 ${answered}개` : "눌러서 답하기"}
        </Text>
      </View>

      {/* 진행 막대. 시작한 분야에만 나온다 — 아직 안 연 박스에 빈 막대가 있으면 못 한 일처럼 보인다 */}
      {started && !done ? (
        <View
          className="mt-3 h-1.5 overflow-hidden rounded-full"
          style={{ backgroundColor: COLORS.line }}
        >
          <View
            className="h-full rounded-full"
            style={{ backgroundColor: COLORS.brand, width: `${ratio * 100}%` }}
          />
        </View>
      ) : (
        <View className="mt-3 h-1.5" />
      )}
    </Pressable>
  );
}

export function SectionGrid({ progress, onOpen }: Props) {
  const done = doneSectionCount(SECTIONS, progress);

  return (
    <View>
      <View className="flex-row items-end justify-between">
        <Text className="text-title font-extrabold text-ink-strong">상황 알아보기</Text>
        <Text className="text-caption font-bold" style={{ color: done === 6 ? COLORS.doneInk : COLORS.brand }}>
          6개 중 {done}개
        </Text>
      </View>
      <Text className="mb-4 mt-2 text-body text-ink-sub">
        하나씩 눌러서 답해 주세요.
      </Text>

      <View className="flex-row flex-wrap justify-between gap-y-3">
        {SECTIONS.map((s) => {
          const p = progress[s.id];
          return (
            <SectionBox
              key={s.id}
              id={s.id}
              label={s.label}
              answered={p?.answered ?? 0}
              visible={p?.visible ?? 0}
              done={isSectionDone(p)}
              onOpen={() => onOpen(s.id)}
            />
          );
        })}
      </View>
    </View>
  );
}
