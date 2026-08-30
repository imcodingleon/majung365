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
  const started = answered > 0;

  return (
    // **박스 안의 것이 왼쪽으로 붙는다** (2026-08-31 시안). 가운데 정렬이던 것을
    // 왼쪽으로 옮기고, 오른쪽 위에 체크 동그라미를 붙였다. 얼마나 했는지는 그
    // 동그라미 하나가 나타낸다.
    //
    // **진행 막대와 "4개 중 2개"를 걷어냈다.** 시안에 없다. 다만 화면에서 사라졌을
    // 뿐이고 **화면 낭독기에는 그대로 읽어 준다** — 눈으로 색을 볼 수 없는 사람에게는
    // 동그라미 색이 아무것도 알려주지 않기 때문이다.
    //
    // 다 한 분야를 초록이 아니라 **파랑**으로 낸다. 시안이 그렇다.
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
      className="w-[48.5%] flex-row items-start justify-between rounded-2xl border-2 pb-8 pl-8 pr-5 pt-5 active:opacity-85"
      style={{
        backgroundColor: done ? COLORS.brandTint : COLORS.surface,
        borderColor: done ? COLORS.brand : COLORS.brandMuted,
      }}
    >
      {/* 그릇 위 12px과 라벨 줄높이 27px은 시안 실측값이다. 둘을 빼면 카드가 9px
          낮아지고, 두 칸씩 세 줄로 놓였을 때 그 차이가 격자 전체에서 27px로 쌓인다 */}
      <View className="items-start pt-3">
        <View
          className="size-9 items-center justify-center rounded-2xl"
          style={{ backgroundColor: COLORS.brandSoft }}
        >
          <SectionIcon id={id} size={32} color={COLORS.brand} />
        </View>

        <Text
          className="mt-3 text-title font-bold leading-[27px]"
          style={{ color: COLORS.inkBody }}
        >
          {label}
        </Text>
      </View>

      {/* 다 했는지 나타내는 표시. 도형은 같고 원 색만 갈린다 — 켜짐과 꺼짐이
          같은 자리에서 같은 크기로 보여야 무엇이 달라졌는지 읽힌다 */}
      <View
        className="size-6 items-center justify-center rounded-full"
        style={{ backgroundColor: done ? COLORS.brand : COLORS.brandMuted }}
      >
        <Icon name="check" size={24} color={COLORS.surface} />
      </View>
    </Pressable>
  );
}

export function SectionGrid({ progress, onOpen }: Props) {
  const done = doneSectionCount(SECTIONS, progress);

  return (
    <View>
      <View className="flex-row items-end justify-between">
        <Text className="text-title font-bold text-ink-strong">상황 알아보기</Text>
        <Text className="text-title font-semibold" style={{ color: COLORS.brand }}>
          6개 중 {done}개
        </Text>
      </View>
      <Text className="mb-4 mt-2 text-body-lg font-medium text-ink-hint">
        하나씩 눌러서 답해 주세요.
      </Text>

      <View className="flex-row flex-wrap justify-between gap-y-[34px]">
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
