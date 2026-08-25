// 문항 하나를 그리는 부분 (§3.7). 질문 문구 아래의 선택지·날짜 칸을 맡는다.
//
// 진행 표시와 이동 버튼은 여기 없다. 그것은 문항을 어떤 순서로 보여줄지 정하는 쪽의 일이며,
// 이 파일은 "이 문항 하나가 어떻게 생겼는가"만 안다.
import { useEffect, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";

import { ChoiceButton } from "@/shared/components/ChoiceButton";
import { DateField } from "@/shared/components/DateField";
import { NoteBox } from "@/shared/components/NoteBox";
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

/** 문항의 선택지. 공용 버튼에 이 화면의 규칙(응급 답 강조)을 얹는다. */
function OptionButton({
  option,
  selected,
  multi,
  tight,
  onPress,
}: {
  option: IntakeOption;
  selected: boolean;
  multi?: boolean;
  /** 세로가 짧은 기기. 선택지 사이 간격만 좁힌다 — 글씨와 누르는 넓이는 그대로 둔다. */
  tight?: boolean;
  onPress: () => void;
}) {
  return (
    <ChoiceButton
      label={option.label}
      selected={selected}
      onPress={onPress}
      urgent={Boolean(option.standout)}
      multi={multi}
      className={tight ? "mb-2" : "mb-3"}
    />
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
          label="날짜"
          minYear={thisYear - 2}
          maxYear={thisYear + 1}
          defaultYear={thisYear}
        />
      </View>

      {question.allowUnknown ? (
        <View className="mt-3">
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

  // **작은 화면에서는 여백을 줄인다.** 선택지가 다섯인 문항이 넷 있는데, 세로가 짧은
  // 기기에서는 마지막 하나가 잘려 안 보였다. 아래에 더 있는 줄 모르면 보이는 것 중에서
  // 고르게 되고, 그 답이 곧 할 일 목록을 정한다 (§3.8·§4.1).
  //
  // 글씨는 줄이지 않는다 — 저리터러시 사용자 전제에서 글씨 크기는 마지막까지 지킨다.
  // 줄이는 것은 사이 간격뿐이다.
  const { height } = useWindowDimensions();
  const tight = height < 720;

  return (
    <View>
      <Text className="text-title font-extrabold text-ink-strong">
        {question.prompt}
      </Text>

      {question.help ? (
        <Text className={`text-body text-ink-sub ${tight ? "mt-1" : "mt-2"}`}>
          {question.help}
        </Text>
      ) : null}

      {question.kind === "multi" ? (
        <Text className="mt-2 text-caption font-bold" style={{ color: COLORS.brand }}>
          맞는 것을 모두 골라 주세요
        </Text>
      ) : null}

      {note ? (
        <NoteBox tone="info" className="mt-4">{note}</NoteBox>
      ) : null}

      <View className={tight ? "mt-3" : "mt-5"}>
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
                multi={question.kind === "multi"}
                tight={tight}
                onPress={() => pick(o.id)}
              />
            ))}
            {standout.length > 0 ? (
              <View className={`border-t border-line ${tight ? "mb-2 mt-1" : "mb-4 mt-2"}`} />
            ) : null}

            {shown.map((o) => (
              <OptionButton
                key={o.id}
                tight={tight}
                option={o}
                selected={isSelected(answer, o.id)}
                multi={question.kind === "multi"}
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
                <Text className="text-body font-semibold text-ink-sub">
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
