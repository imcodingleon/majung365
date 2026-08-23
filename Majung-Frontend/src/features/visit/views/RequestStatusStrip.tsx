// 요청 상태 표시 (§7.1). 할 일 카드 안에 붙는다.
//
// 상태가 없으면 사용자는 보내놓고 아무것도 모르는 채 기다리게 된다.
// 확정 상태의 문구가 이 기능의 핵심이다. 만날 사람의 이름과 만날 장소가 반드시 보여야 한다.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";

import {
  canCancel,
  canOpenStaffChat,
  cancelNeedsConfirm,
  statusMessage,
  type VisitRequest,
} from "../domain/request";

type Props = {
  request: VisitRequest;
  onOpenStaffChat: () => void;
  /** 담당자가 제안한 다른 시간을 받아들이거나 물린다. */
  onAcceptProposal?: () => void;
  onDeclineProposal?: () => void;
  /** 취소된 요청을 다시 보낸다. */
  onResend?: () => void;
  /** 보낸 요청을 물린다. 못 가게 되는 일은 실제로 생기고, 그때 담당자가 헛되이 기다린다. */
  onCancel?: () => void;
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
      className="rounded-lg border-[1.5px] px-4 py-3 active:opacity-90"
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
  onCancel,
}: Props) {
  const tone = TONE_STYLE[toneOf(request)];
  const confirmed = request.status === "confirmed";
  // 확정된 요청만 한 번 더 묻는다. 담당자가 시간과 창구를 비워둔 상태라 무르는 값이
  // 다르다. 확정 전이면 묻지 않는다 — 확인 절차가 늘수록 그만두게 된다.
  const [confirming, setConfirming] = useState(false);

  return (
    <View
      className="mb-4 rounded-xl border px-4 py-4"
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

      {/* **눈에 덜 띄게 둔다.** 물리는 것이 이 화면의 목적이 아니고, 크게 두면
          기다리는 동안 눌러 보게 된다. 다만 찾을 수는 있어야 한다 */}
      {onCancel && canCancel(request.status) ? (
        confirming ? (
          <View className="mt-3">
            <Text className="mb-2 text-caption" style={{ color: tone.ink }}>
              담당자가 시간을 비워 두었어요. 정말 안 가시겠어요?
            </Text>
            <View className="flex-row gap-2">
              <SmallButton label="네, 안 갈래요" filled onPress={onCancel} />
              <SmallButton label="아니요" onPress={() => setConfirming(false)} />
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => (cancelNeedsConfirm(request.status) ? setConfirming(true) : onCancel())}
            accessibilityRole="button"
            accessibilityLabel="이 요청 물리기"
            className="mt-3 self-start px-1 py-2 active:opacity-60"
          >
            <Text className="text-caption font-bold underline" style={{ color: tone.ink }}>
              안 가게 됐어요
            </Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}
