// 카드를 펼쳤을 때 나오는 본문 (§6.1 · 2026-08-23 시안).
// 채팅은 이 카드 안에 그리지 않는다. "AI 챗봇과 대화하기"를 누르면 화면 전체를 덮는 팝업이 열린다.
//
// 카드 머리(제목·번호·기관)는 TaskRow가 그린다. 여기는 그 아래 내용만 맡는다.
import { Pressable, Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";

import type { Task } from "../domain/task";

type Props = {
  task: Task;
  done: boolean;
  /** 아직 마치지 않은 선행 필수 항목들. 있으면 먼저 하도록 유도한다. 차단이 아니라 유도다 (§5.2). */
  pendingMust: readonly string[];
  onOpenChat: () => void;
  onNotifyStaff?: () => void;
  onComplete: () => void;
  /** 보낸 방문 요청의 상태 표시 (§7.1). 라우트가 조립해 넣는다. */
  statusStrip?: React.ReactNode;
};

function GuideNote({ tone, children }: { tone: "hint" | "done"; children: React.ReactNode }) {
  const style =
    tone === "done"
      ? { backgroundColor: COLORS.doneBg, borderColor: COLORS.doneLine, color: COLORS.doneInk }
      : { backgroundColor: COLORS.noteWarn, borderColor: COLORS.noteWarnLine, color: COLORS.noteWarnInk };
  return (
    <View
      className="mb-3.5 rounded-xl border px-3.5 py-3"
      style={{ backgroundColor: style.backgroundColor, borderColor: style.borderColor }}
    >
      <Text className="text-sm font-semibold leading-[23px]" style={{ color: style.color }}>
        {children}
      </Text>
    </View>
  );
}

function ActionButton({
  label,
  tone,
  onPress,
}: {
  label: string;
  tone: "primary" | "ghost" | "notify";
  onPress: () => void;
}) {
  const filled = tone === "primary";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="items-center rounded-xl border-[1.5px] px-4 py-3.5 active:opacity-90"
      style={{
        backgroundColor: filled ? COLORS.brand : COLORS.surface,
        borderColor: filled ? COLORS.brand : tone === "notify" ? COLORS.actionLine : COLORS.line,
      }}
    >
      <Text
        className="text-base font-extrabold"
        style={{ color: filled ? COLORS.surface : tone === "notify" ? COLORS.action : COLORS.inkSub }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function TaskCard({
  task,
  done,
  pendingMust,
  onOpenChat,
  onNotifyStaff,
  onComplete,
  statusStrip,
}: Props) {
  // 선행 필수를 남겨 둔 채 뒤 순서를 열었을 때만 유도 문구를 낸다.
  const showGuide = !task.must && !done && pendingMust.length > 0;

  return (
    <View className="px-4 pb-4 pt-4">
      {showGuide ? (
        <GuideNote tone="hint">
          🔑 {pendingMust.join("과 ")}를 먼저 마치면 이 일이 훨씬 쉬워져요.{"\n"}
          그래도 지금 보고 싶으시면 계속 보셔도 괜찮아요.
        </GuideNote>
      ) : null}

      {done ? <GuideNote tone="done">🎉 끝낸 일이에요. 잘하셨어요.</GuideNote> : null}

      <View className="mb-3.5">
        {task.info.map((line) => (
          <View key={line} className="mb-1.5 flex-row pr-1">
            <Text className="mr-2 text-[15px] font-extrabold" style={{ color: COLORS.doneInk }}>
              ✓
            </Text>
            <Text className="flex-1 text-[15px] leading-[26px] text-ink-body">{line}</Text>
          </View>
        ))}
      </View>

      {/* 갈 곳이 하나로 정해지는 항목은 전화번호보다 창구 안내가 먼저 온다 (§6.4). */}
      {task.desk ? (
        <View className="mb-3.5 rounded-xl border border-note-info-line bg-note-info px-3.5 py-3">
          <Text className="text-[15px] font-bold leading-[25px] text-note-info-ink">
            {task.desk.place}에 가서 “{task.desk.say}”라고 말하면 돼요.
          </Text>
        </View>
      ) : null}

      {/* 시안의 회색 안내 상자. 창구 안내(파랑)와 층이 갈리게 색을 낮춘다 —
          갈 곳이 정해진 항목에서는 창구가 먼저 읽혀야 한다 (§6.4) */}
      {task.contact ? (
        <View className="mb-3.5 rounded-xl px-3.5 py-3" style={{ backgroundColor: COLORS.bubble }}>
          <Text className="text-[14px] leading-[23px] text-ink-sub">
            더 물어볼 것이 있으면 {task.contact.org} {task.contact.phone}으로 전화해 주세요.
          </Text>
          {task.contact.hours ? (
            <Text className="mt-0.5 text-[14px] leading-[23px] text-ink-sub">
              전화받는 시간은 {task.contact.hours}예요.
            </Text>
          ) : null}
        </View>
      ) : null}

      {statusStrip}

      <View className="gap-2">
        <ActionButton label="💬 AI 챗봇과 대화하기" tone="primary" onPress={onOpenChat} />
        {task.visitLabel && onNotifyStaff ? (
          <ActionButton
            label={`🔔 ${task.visitLabel} 담당자에게 미리 알리기`}
            tone="notify"
            onPress={onNotifyStaff}
          />
        ) : null}
        {!done ? (
          <ActionButton label="✅ 이 일을 끝냈어요" tone="ghost" onPress={onComplete} />
        ) : null}
      </View>
    </View>
  );
}
