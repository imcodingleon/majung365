// 한 분야의 문항을 한 번에 하나씩 묻는 팝업 (§3.7).
//
// 예전에는 분야 박스를 펼치면 그 안에 문항이 세로로 죽 늘어섰다. 저리터러시 사용자에게
// **한 화면에 한 가지**가 원칙인데 그 방식은 원칙을 정면으로 어긴다. 그래서 화면을 덮는
// 팝업으로 옮기고 문항을 하나씩 낸다.
//
// 되돌아갈 수 있어야 한다. 잘못 골랐을 때 처음부터 다시 해야 한다면 도중에 그만두게 된다.
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "@/shared/theme/colors";
import { deferClose } from "@/shared/utils/deferClose";

import { isAnswered, type IntakeAnswers, type IntakeQuestion } from "../domain/questionTypes";
import type { SectionId } from "../domain/sections";
import { urgentNoticeFor, type UrgentNotice as Notice } from "../domain/urgent";

import { QuestionBody } from "./QuestionBody";
import { SectionIcon } from "./SectionIcon";
import { UrgentNotice } from "./UrgentNotice";

type Props = {
  /** 열려 있는 분야. 닫혀 있으면 null. */
  sectionId: SectionId | null;
  sectionLabel: string;
  /**
   * 지금 이 분야에서 화면에 낼 문항들.
   *
   * **답에 따라 길이가 바뀐다.** 꼬리질문이 열리면 지금 문항 바로 뒤에 끼어들기 때문에
   * 보고 있던 자리는 그대로 있고 다음으로 넘어갈 때 새 문항을 만나게 된다.
   */
  questions: readonly IntakeQuestion[];
  answers: IntakeAnswers;
  onSelectSingle: (questionId: string, optionId: string) => void;
  onToggleMulti: (question: IntakeQuestion, optionId: string) => void;
  /** 팝업을 닫는다. 답한 것은 그대로 남는다. */
  onClose: () => void;
};

export function QuestionFlow({
  sectionId,
  sectionLabel,
  questions,
  answers,
  onSelectSingle,
  onToggleMulti,
  onClose,
}: Props) {
  const [step, setStep] = useState(0);
  /** 급한 답을 골랐을 때 덮어씌우는 안내. 닫으면 이어서 답한다. */
  const [urgent, setUrgent] = useState<Notice | null>(null);
  /** 이미 낸 안내는 다시 내지 않는다. 답을 고칠 때마다 또 뜨면 방해가 된다. */
  const shown = useRef<string | null>(null);

  // 분야를 새로 열면 처음 문항부터 시작한다.
  useEffect(() => setStep(0), [sectionId]);

  // 답을 바꿔 꼬리질문이 닫히면 목록이 짧아진다. 없는 자리를 가리키지 않게 당긴다.
  useEffect(() => {
    setStep((prev) => Math.min(prev, Math.max(0, questions.length - 1)));
  }, [questions.length]);

  const total = questions.length;
  const question = questions[step];

  // **다 마칠 때까지 기다리지 않는다.** 고르는 순간 안내가 나가야 하는 답이 있다 (§3.9-⑩).
  useEffect(() => {
    if (!question) return;
    const notice = urgentNoticeFor(question, answers);
    if (!notice) return;
    if (shown.current === question.id) return;
    shown.current = question.id;
    setUrgent(notice);
  }, [question, answers]);

  const answered = question ? isAnswered(question, answers) : false;
  const last = step >= total - 1;

  // 닫기를 미루지 않으면 이 클릭이 뒤 화면의 분야 격자까지 눌러 다른 팝업이 열린다.
  const close = deferClose(onClose);

  const goPrev = () => setStep((prev) => Math.max(0, prev - 1));
  const goNext = () => {
    if (last) {
      close();
      return;
    }
    setStep((prev) => prev + 1);
  };

  if (!sectionId) return null;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
        {/* 어느 분야를 답하는 중인지 항상 보인다. 팝업은 앞뒤 맥락이 없어 더 필요하다. */}
        <View className="flex-row items-center gap-3 border-b border-line px-5 py-4">
          <View
            className="size-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: COLORS.brandSoft }}
          >
            <SectionIcon id={sectionId} size={22} color={COLORS.brand} />
          </View>
          <Text className="flex-1 text-heading font-extrabold text-ink-strong">{sectionLabel}</Text>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="닫기. 답하신 것은 그대로 남아요"
            className="rounded-xl border border-line px-4 py-3 active:opacity-70"
          >
            <Text className="text-body font-bold text-ink-sub">닫기</Text>
          </Pressable>
        </View>

        {/* 몇 개 남았는지 모르면 도중에 그만두게 된다. 막대와 숫자를 함께 낸다. */}
        <View className="px-5 pt-4">
          <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: COLORS.line }}>
            <View
              className="h-full rounded-full"
              style={{
                backgroundColor: COLORS.brand,
                width: total > 0 ? `${((step + 1) / total) * 100}%` : "0%",
              }}
            />
          </View>
          <Text className="mt-2 text-caption font-bold text-ink-muted">
            {total}개 중 {Math.min(step + 1, total)}번째
          </Text>
        </View>

        {/* key를 문항 id로 두면 다음 문항으로 넘어갈 때 스크롤이 맨 위에서 시작한다.
            앞 문항에서 내려둔 위치가 남아 있으면 질문 문구가 화면 밖에 있다. */}
        <ScrollView key={question?.id} className="flex-1" contentContainerClassName="px-5 pb-8 pt-5">
          {question ? (
            <QuestionBody
              question={question}
              answers={answers}
              onSelectSingle={onSelectSingle}
              onToggleMulti={onToggleMulti}
            />
          ) : (
            <Text className="text-body-lg text-ink-sub">
              이 분야 질문은 곧 준비돼요.
            </Text>
          )}
        </ScrollView>

        <View className="border-t border-line px-5 pb-2 pt-3">
          {/* **버튼이 왜 흐린지를 말한다.** 원래 "답을 고르시면 다음으로 넘어가요"였는데,
              고르면 저절로 넘어간다고 읽혀 사용자가 화면을 보며 기다리게 된다.
              실제로는 답을 골라야 버튼이 켜지고, 넘기는 것은 사용자가 한다 */}
          {!answered && question ? (
            <Text className="mb-3 text-center text-caption text-ink-muted">
              답을 고르시면 다음으로 갈 수 있어요.
            </Text>
          ) : null}

          <View className="flex-row gap-3">
            <Pressable
              onPress={goPrev}
              disabled={step === 0}
              accessibilityRole="button"
              accessibilityState={{ disabled: step === 0 }}
              accessibilityLabel="이전 질문으로"
              className="flex-1 items-center rounded-2xl border-[1.5px] py-4 active:opacity-80"
              style={{
                borderColor: step === 0 ? COLORS.line : COLORS.lineStrong,
                opacity: step === 0 ? 0.4 : 1,
              }}
            >
              <Text className="text-body-lg font-bold text-ink-sub">이전</Text>
            </Pressable>

            <Pressable
              onPress={goNext}
              disabled={!answered}
              accessibilityRole="button"
              accessibilityState={{ disabled: !answered }}
              accessibilityLabel={last ? "다 답했어요" : "다음 질문으로"}
              className="flex-[1.6] items-center rounded-2xl py-4 active:opacity-90"
              style={{ backgroundColor: answered ? COLORS.brand : COLORS.brandMuted }}
            >
              <Text className="text-body-lg font-extrabold text-white">
                {last ? "다 답했어요" : "다음"}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <UrgentNotice notice={urgent} onClose={() => setUrgent(null)} />
    </Modal>
  );
}
