// 상황 알아보기 — 6분야 박스 (§3.7).
//
// 별도 질문 페이지로 이동하지 않는다. 가입 화면 안의 박스를 눌러 펼쳐서 답한다.
// 앱을 켜자마자 질문부터 던지지 않고, 개인정보 입력이 먼저 오고 문항이 그 아래에 놓인다.
//
// 문항 본문은 아직 붙지 않았다. optionId 값이 기획 검토 중이라 코드에 고정값으로 박지 않는다
// (intake-questions.md §9). 지금은 박스를 여닫는 동작과 진행 표시까지 있다.
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";

import { doneSectionCount, isSectionDone, type IntakeProgress } from "../domain/progress";
import { SECTIONS, type SectionId } from "../domain/sections";

type Props = {
  progress: IntakeProgress;
  /** 지금 펼쳐진 분야. 한 번에 하나만 펼친다. */
  openId: SectionId | null;
  onToggle: (id: SectionId) => void;
  /** 펼쳐진 분야의 문항을 그린다. 문항 화면이 붙으면 여기로 들어온다. */
  renderQuestions?: (id: SectionId) => React.ReactNode;
};

function SectionBox({
  id,
  label,
  icon,
  done,
  open,
  onToggle,
  children,
}: {
  id: SectionId;
  label: string;
  icon: number;
  done: boolean;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View className="mb-2.5">
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}. ${done ? "다 답하셨어요" : "눌러서 답하기"}`}
        className="flex-row items-center gap-3 rounded-2xl border-[1.5px] px-4 py-4 active:opacity-90"
        style={{
          backgroundColor: done ? COLORS.doneBg : COLORS.surface,
          borderColor: done ? COLORS.doneLine : COLORS.brandSoft,
          borderBottomLeftRadius: open ? 0 : 16,
          borderBottomRightRadius: open ? 0 : 16,
        }}
      >
        <View
          className="size-11 items-center justify-center rounded-xl"
          style={{ backgroundColor: done ? COLORS.surface : COLORS.brandSoft }}
        >
          <Image source={icon} style={{ width: 22, height: 22 }} contentFit="contain" />
        </View>

        <Text
          className="flex-1 text-[17px] font-extrabold"
          style={{ color: done ? COLORS.doneInk : COLORS.inkStrong }}
        >
          {label}
        </Text>

        {done ? (
          <Text className="text-[15px] font-extrabold" style={{ color: COLORS.doneInk }}>
            ✓ 다 답하셨어요
          </Text>
        ) : (
          <Text className="text-2xl" style={{ color: COLORS.inkMuted }}>
            {open ? "⌃" : "⌄"}
          </Text>
        )}
      </Pressable>

      {open && children ? (
        <View
          className="rounded-b-2xl border-[1.5px] border-t-0 border-brand-soft bg-card px-4 pb-4 pt-4"
          testID={`intake-section-${id}`}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

export function SectionBoxes({ progress, openId, onToggle, renderQuestions }: Props) {
  const done = doneSectionCount(SECTIONS, progress);

  return (
    <View>
      <Text className="text-[19px] font-extrabold text-ink-strong">상황 알아보기</Text>
      <Text className="mt-1.5 text-[15px] leading-[25px] text-ink-sub">
        하나씩 눌러서 답해 주세요.{"\n"}
        답하신 만큼 할 일을 더 정확하게 알려드릴 수 있어요.
      </Text>

      {/* 진행 정도를 항상 보여준다 (intake-questions.md §0-2). */}
      <Text className="mb-4 mt-3 text-sm font-bold" style={{ color: COLORS.doneInk }}>
        6개 분야 중 {done}개 마쳤어요
      </Text>

      {SECTIONS.map((s) => (
        <SectionBox
          key={s.id}
          id={s.id}
          label={s.label}
          icon={s.icon as number}
          done={isSectionDone(progress[s.id])}
          open={openId === s.id}
          onToggle={() => onToggle(s.id)}
        >
          {renderQuestions ? (
            renderQuestions(s.id)
          ) : (
            // 문항이 붙기 전까지의 자리. 빈 박스가 열리면 고장으로 보인다.
            <Text className="text-[15px] leading-[25px] text-ink-sub">
              이 분야 질문은 곧 준비돼요.
            </Text>
          )}
        </SectionBox>
      ))}
    </View>
  );
}
