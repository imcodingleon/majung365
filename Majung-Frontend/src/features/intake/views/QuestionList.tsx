// 한 분야의 문항 목록 (§3.7). 6분야 박스를 펼쳤을 때 그 안에 들어간다.
//
// 문항 값은 domain/questions.ts 한 곳에만 있다. 이 화면은 타입만 보고 그리므로
// 문구나 optionId가 확정되어도 여기는 고치지 않는다.
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";

import {
  DATE_UNKNOWN,
  noteFor,
  visibleOptions,
  type IntakeAnswers,
  type IntakeOption,
  type IntakeQuestion,
} from "../domain/questionTypes";

type Props = {
  questions: readonly IntakeQuestion[];
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
      className="mb-2 rounded-xl border-[1.5px] px-4 py-3.5 active:opacity-80"
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
      <Text
        className="text-[15px] leading-[24px]"
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

/** 날짜 문항. "잘 모르겠어요"를 함께 두어 모르는 사람이 막히지 않게 한다. */
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
  const value = unknown ? "" : (answer ?? "");
  const [year = "", month = "", day = ""] = value.split("-");

  const update = (next: { y?: string; m?: string; d?: string }) => {
    const y = next.y ?? year;
    const m = next.m ?? month;
    const d = next.d ?? day;
    onChange(`${y}-${m}-${d}`);
  };

  const box =
    "rounded-xl border-[1.5px] border-line bg-white px-3 py-3 text-center text-base text-ink-strong";

  return (
    <View>
      <View className="mb-2 flex-row items-center gap-2" style={{ opacity: unknown ? 0.4 : 1 }}>
        <TextInput
          className={`${box} w-20`}
          value={year}
          onChangeText={(t) => update({ y: t.replace(/\D/g, "").slice(0, 4) })}
          keyboardType="number-pad"
          placeholder="2026"
          placeholderTextColor={COLORS.inkMuted}
          editable={!unknown}
          accessibilityLabel={`${question.prompt} 년`}
        />
        <Text className="text-[15px] text-ink-sub">년</Text>
        <TextInput
          className={`${box} w-14`}
          value={month}
          onChangeText={(t) => update({ m: t.replace(/\D/g, "").slice(0, 2) })}
          keyboardType="number-pad"
          placeholder="9"
          placeholderTextColor={COLORS.inkMuted}
          editable={!unknown}
          accessibilityLabel={`${question.prompt} 월`}
        />
        <Text className="text-[15px] text-ink-sub">월</Text>
        <TextInput
          className={`${box} w-14`}
          value={day}
          onChangeText={(t) => update({ d: t.replace(/\D/g, "").slice(0, 2) })}
          keyboardType="number-pad"
          placeholder="1"
          placeholderTextColor={COLORS.inkMuted}
          editable={!unknown}
          accessibilityLabel={`${question.prompt} 일`}
        />
        <Text className="text-[15px] text-ink-sub">일</Text>
      </View>

      {question.allowUnknown ? (
        <OptionButton
          option={{ id: DATE_UNKNOWN, label: "잘 모르겠어요" }}
          selected={unknown}
          onPress={() => onChange(unknown ? "" : DATE_UNKNOWN)}
        />
      ) : null}
    </View>
  );
}

function QuestionBlock({
  question,
  index,
  total,
  answers,
  onSelectSingle,
  onToggleMulti,
}: {
  question: IntakeQuestion;
  index: number;
  total: number;
  answers: IntakeAnswers;
  onSelectSingle: (questionId: string, optionId: string) => void;
  onToggleMulti: (question: IntakeQuestion, optionId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const options = visibleOptions(question, answers);
  const note = noteFor(question, answers);
  const answer = answers[question.id];

  // 처리가 다른 답은 맨 위에 두고 구분선으로 떼어 놓는다 (규칙 ⑩).
  const standout = options.filter((o) => o.standout);
  const rest = options.filter((o) => !o.standout);
  const shown = expanded ? rest : rest.filter((o) => !o.collapsed);
  const hasCollapsed = rest.some((o) => o.collapsed);

  return (
    <View className="mb-7">
      {/* 진행 정도를 항상 보여준다. 몇 개가 남았는지 모르면 도중에 그만두게 된다. */}
      <Text className="mb-1.5 text-[13px] font-bold text-ink-muted">
        {total}개 중 {index + 1}번째
      </Text>
      <Text className="mb-2 text-[17px] font-extrabold leading-[26px] text-ink-strong">
        {question.prompt}
      </Text>

      {question.help ? (
        <Text className="mb-3 text-sm leading-[23px] text-ink-muted">{question.help}</Text>
      ) : null}

      {note ? (
        <View className="mb-3 rounded-xl border border-note-info-line bg-note-info px-3.5 py-3">
          <Text className="text-sm font-semibold leading-[23px] text-note-info-ink">{note}</Text>
        </View>
      ) : null}

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
              onPress={() =>
                question.kind === "multi"
                  ? onToggleMulti(question, o.id)
                  : onSelectSingle(question.id, o.id)
              }
            />
          ))}
          {standout.length > 0 ? <View className="mb-3 mt-1 border-t border-line" /> : null}

          {shown.map((o) => (
            <OptionButton
              key={o.id}
              option={o}
              selected={isSelected(answer, o.id)}
              onPress={() =>
                question.kind === "multi"
                  ? onToggleMulti(question, o.id)
                  : onSelectSingle(question.id, o.id)
              }
            />
          ))}

          {hasCollapsed && !expanded && question.expandLabel ? (
            <Pressable
              onPress={() => setExpanded(true)}
              accessibilityRole="button"
              accessibilityLabel={question.expandLabel}
              className="mb-2 rounded-xl border-[1.5px] border-dashed border-line px-4 py-3.5 active:opacity-80"
            >
              <Text className="text-[15px] font-semibold text-ink-sub">
                {question.expandLabel} ⌄
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

export function QuestionList({ questions, answers, onSelectSingle, onToggleMulti }: Props) {
  if (questions.length === 0) {
    return (
      <Text className="text-[15px] leading-[25px] text-ink-sub">이 분야 질문은 곧 준비돼요.</Text>
    );
  }

  return (
    <View>
      {questions.map((q, i) => (
        <QuestionBlock
          key={q.id}
          question={q}
          index={i}
          total={questions.length}
          answers={answers}
          onSelectSingle={onSelectSingle}
          onToggleMulti={onToggleMulti}
        />
      ))}
    </View>
  );
}
