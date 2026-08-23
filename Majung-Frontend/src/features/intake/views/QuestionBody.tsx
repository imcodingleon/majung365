// 문항 하나를 그리는 부분 (§3.7). 질문 문구 아래의 선택지·날짜 칸을 맡는다.
//
// 진행 표시와 이동 버튼은 여기 없다. 그것은 문항을 어떤 순서로 보여줄지 정하는 쪽의 일이며,
// 이 파일은 "이 문항 하나가 어떻게 생겼는가"만 안다.
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { DateField } from "@/shared/components/DateField";
import { COLORS } from "@/shared/theme/colors";
import type { DateParts } from "@/shared/types/date";

import {
  DATE_UNKNOWN,
  noteFor,
  visibleOptions,
  type IntakeAnswers,
  type IntakeOption,
  type IntakeQuestion,
} from "../domain/questionTypes";

type Props = {
  question: IntakeQuestion;
  answers: IntakeAnswers;
  onSelectSingle: (questionId: string, optionId: string) => void;
  onToggleMulti: (question: IntakeQuestion, optionId: string) => void;
};

function OptionButton({
  option,
  selected,
  onPress,
}: {
  option: IntakeOption;
  selected: boolean;
  onPress: () => void;
}) {
  const urgent = Boolean(option.standout);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={option.label}
      className="mb-2.5 flex-row items-center gap-3 rounded-2xl border-[1.5px] px-4 py-4 active:opacity-80"
      style={{
        backgroundColor: selected
          ? urgent
            ? COLORS.alertSoft
            : COLORS.brandSoft
          : COLORS.surface,
        borderColor: selected
          ? urgent
            ? COLORS.alert
            : COLORS.brand
          : urgent
            ? COLORS.alertLine
            : COLORS.line,
      }}
    >
      {/* 고른 것이 한눈에 보여야 한다. 색만으로는 구별이 어려운 사람이 있다 */}
      <View
        className="size-6 items-center justify-center rounded-full border-2"
        style={{
          backgroundColor: selected ? (urgent ? COLORS.alert : COLORS.brand) : "transparent",
          borderColor: selected ? (urgent ? COLORS.alert : COLORS.brand) : COLORS.lineStrong,
        }}
      >
        {selected ? <Text className="text-[13px] font-extrabold text-white">✓</Text> : null}
      </View>
      <Text
        className="flex-1 text-[16px] leading-[25px]"
        style={{
          color: urgent ? COLORS.alert : selected ? COLORS.brand : COLORS.inkStrong,
          fontWeight: selected || urgent ? "800" : "600",
        }}
      >
        {option.label}
      </Text>
    </Pressable>
  );
}

function isSelected(answer: IntakeAnswers[string] | undefined, optionId: string): boolean {
  if (answer === undefined) return false;
  if (Array.isArray(answer)) return answer.includes(optionId);
  return answer === optionId;
}

/**
 * 날짜 문항. 가입 화면의 생일·출소일과 같은 고르기 화면을 쓴다.
 *
 * 여기서 묻는 날짜는 "언제까지 해야 하는 일"의 기준이라 최근 몇 해면 충분하다.
 * 생일처럼 멀리 거슬러 갈 일이 없어 고를 수 있는 범위만 다르다.
 */
function DateAnswer({
  question,
  answer,
  onChange,
}: {
  question: IntakeQuestion;
  answer: string | undefined;
  onChange: (value: string) => void;
}) {
  const unknown = answer === DATE_UNKNOWN;
  const [year = "", month = "", day = ""] = (unknown ? "" : (answer ?? "")).split("-");
  const parts: DateParts = { year, month, day };

  const thisYear = new Date().getFullYear();

  return (
    <View>
      <View style={{ opacity: unknown ? 0.35 : 1 }} pointerEvents={unknown ? "none" : "auto"}>
        <DateField
          value={parts}
          onChange={(next) => onChange(`${next.year}-${next.month}-${next.day}`)}
          label={question.prompt}
          minYear={thisYear - 2}
          maxYear={thisYear + 1}
          defaultYear={thisYear}
        />
      </View>

      {question.allowUnknown ? (
        <View className="mt-2.5">
          <OptionButton
            option={{ id: DATE_UNKNOWN, label: "잘 모르겠어요" }}
            selected={unknown}
            onPress={() => onChange(unknown ? "" : DATE_UNKNOWN)}
          />
        </View>
      ) : null}
    </View>
  );
}

export function QuestionBody({ question, answers, onSelectSingle, onToggleMulti }: Props) {
  const [expanded, setExpanded] = useState(false);
  const options = visibleOptions(question, answers);
  const note = noteFor(question, answers);
  const answer = answers[question.id];

  // 문항이 바뀌면 접힌 선택지도 다시 접힌다. 앞 문항에서 펼친 상태가 따라오면 안 된다.
  useEffect(() => setExpanded(false), [question.id]);

  // 처리가 다른 답은 맨 위에 두고 구분선으로 떼어 놓는다 (규칙 ⑩).
  const standout = options.filter((o) => o.standout);
  const rest = options.filter((o) => !o.standout);
  const shown = expanded ? rest : rest.filter((o) => !o.collapsed);
  const hasCollapsed = rest.some((o) => o.collapsed);

  const pick = (optionId: string) =>
    question.kind === "multi"
      ? onToggleMulti(question, optionId)
      : onSelectSingle(question.id, optionId);

  return (
    <View>
      <Text className="text-[22px] font-extrabold leading-[33px] text-ink-strong">
        {question.prompt}
      </Text>

      {question.help ? (
        <Text className="mt-2 text-[15px] leading-[24px] text-ink-sub">{question.help}</Text>
      ) : null}

      {question.kind === "multi" ? (
        <Text className="mt-2 text-[14px] font-bold" style={{ color: COLORS.brand }}>
          맞는 것을 모두 골라 주세요
        </Text>
      ) : null}

      {note ? (
        <View className="mt-4 rounded-2xl border border-note-info-line bg-note-info px-4 py-3.5">
          <Text className="text-[15px] font-semibold leading-[24px] text-note-info-ink">{note}</Text>
        </View>
      ) : null}

      <View className="mt-5">
        {question.kind === "date" ? (
          <DateAnswer
            question={question}
            answer={typeof answer === "string" ? answer : undefined}
            onChange={(value) => onSelectSingle(question.id, value)}
          />
        ) : (
          <>
            {standout.map((o) => (
              <OptionButton
                key={o.id}
                option={o}
                selected={isSelected(answer, o.id)}
                onPress={() => pick(o.id)}
              />
            ))}
            {standout.length > 0 ? <View className="mb-4 mt-1.5 border-t border-line" /> : null}

            {shown.map((o) => (
              <OptionButton
                key={o.id}
                option={o}
                selected={isSelected(answer, o.id)}
                onPress={() => pick(o.id)}
              />
            ))}

            {hasCollapsed && !expanded && question.expandLabel ? (
              <Pressable
                onPress={() => setExpanded(true)}
                accessibilityRole="button"
                accessibilityLabel={question.expandLabel}
                className="mb-2 rounded-2xl border-[1.5px] border-dashed border-line px-4 py-4 active:opacity-80"
              >
                <Text className="text-[15px] font-semibold text-ink-sub">
                  {question.expandLabel} ⌄
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}
