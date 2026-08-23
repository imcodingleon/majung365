// 요청 상태 표시 (§7.1). 할 일 카드 안에 붙는다.
//
// 상태가 없으면 사용자는 보내놓고 아무것도 모르는 채 기다리게 된다.
// 확정 상태의 문구가 이 기능의 핵심이다. 만날 사람의 이름과 만날 장소가 반드시 보여야 한다.
import { Pressable, Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";

import { canOpenStaffChat, statusMessage, type VisitRequest } from "../domain/request";

type Props = {
  request: VisitRequest;
  onOpenStaffChat: () => void;
  /** 담당자가 제안한 다른 시간을 받아들이거나 물린다. */
  onAcceptProposal?: () => void;
  onDeclineProposal?: () => void;
  /** 취소된 요청을 다시 보낸다. */
  onResend?: () => void;
};

type Tone = "info" | "done" | "warn";

const TONE_STYLE: Record<Tone, { bg: string; line: string; ink: string }> = {
  info: { bg: COLORS.noteInfo, line: COLORS.noteInfoLine, ink: COLORS.noteInfoInk },
  done: { bg: COLORS.doneBg, line: COLORS.doneLine, ink: COLORS.doneInk },
  warn: { bg: COLORS.noteWarn, line: COLORS.noteWarnLine, ink: COLORS.noteWarnInk },
};

function toneOf(request: VisitRequest): Tone {
  if (request.status === "confirmed" || request.status === "completed") return "done";
  if (request.status === "reschedule_proposed" || request.status === "cancelled") return "warn";
  return "info";
}

function SmallButton({
  label,
  filled,
  onPress,
}: {
  label: string;
  filled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="rounded-lg border-[1.5px] px-3.5 py-2.5 active:opacity-90"
      style={{
        backgroundColor: filled ? COLORS.brand : COLORS.surface,
        borderColor: filled ? COLORS.brand : COLORS.line,
      }}
    >
      <Text
        className="text-caption font-extrabold"
        style={{ color: filled ? COLORS.surface : COLORS.inkSub }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function RequestStatusStrip({
  request,
  onOpenStaffChat,
  onAcceptProposal,
  onDeclineProposal,
  onResend,
}: Props) {
  const tone = TONE_STYLE[toneOf(request)];
  const confirmed = request.status === "confirmed";

  return (
    <View
      className="mb-3.5 rounded-xl border px-4 py-3.5"
      style={{ backgroundColor: tone.bg, borderColor: tone.line }}
    >
      <Text
        className="leading-[25px]"
        style={{
          color: tone.ink,
          // 확정 문구는 실제로 찾아가야 할 정보를 담고 있으므로 더 크고 굵게 낸다.
          fontSize: confirmed ? 16 : 14.5,
          fontWeight: confirmed ? "800" : "600",
        }}
      >
        {statusMessage(request)}
      </Text>

      {request.status === "reschedule_proposed" && onAcceptProposal && onDeclineProposal ? (
        <View className="mt-3 flex-row gap-2">
          <SmallButton label="그때 갈게요" filled onPress={onAcceptProposal} />
          <SmallButton label="다시 정할게요" onPress={onDeclineProposal} />
        </View>
      ) : null}

      {request.status === "cancelled" && onResend ? (
        <View className="mt-3 flex-row">
          <SmallButton label="다시 보내기" filled onPress={onResend} />
        </View>
      ) : null}

      {canOpenStaffChat(request.status) ? (
        <View className="mt-3 flex-row">
          <SmallButton label="담당자와 이야기하기" onPress={onOpenStaffChat} />
        </View>
      ) : null}
    </View>
  );
}
