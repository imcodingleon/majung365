// 요청 상태 표시 (§7.1). 할 일 카드 안에 붙는다.
//
// 상태가 없으면 사용자는 보내놓고 아무것도 모르는 채 기다리게 된다.
// 확정 상태의 문구가 이 기능의 핵심이다. 만날 사람의 이름과 만날 장소가 반드시 보여야 한다.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Icon, type IconName } from "@/shared/components/Icon";
import { COLORS } from "@/shared/theme/colors";
import { FONTS } from "@/shared/theme/fonts";

import {
  canCancel,
  canOpenStaffChat,
  cancelNeedsConfirm,
  statusLines,
  type VisitRequest,
} from "../domain/request";

type Props = {
  request: VisitRequest;
  onOpenStaffChat: () => void;
  /** 취소된 요청을 다시 보낸다. */
  onResend?: () => void;
  /** 보낸 요청을 물린다. 못 가게 되는 일은 실제로 생기고, 그때 담당자가 헛되이 기다린다. */
  /**
   * 요청을 물린다. **성공 여부를 돌려줘야 한다.** 실패했는데 확인 문구가 그대로
   * 떠 있으면 사용자는 물린 줄 알고 나가고, 담당자는 그 시간을 계속 비워 둔다 —
   * 이 기능을 만든 이유가 바로 그 상황이었다.
   */
  onCancel?: () => Promise<boolean> | void;
};

type Tone = "info" | "done" | "warn";

/**
 * `head`는 첫 줄과 아이콘에 쓰는 강조색이다. **`ink`보다 진하다** (2026-08-31 시안).
 * 첫 줄이 지금 상태이고 뒤따르는 줄은 부연이라, 같은 색으로 두면 층이 갈리지 않는다.
 */
const TONE_STYLE: Record<Tone, { bg: string; line: string; ink: string; head: string }> = {
  info: { bg: COLORS.noteInfo, line: COLORS.noteInfoLine, ink: COLORS.noteInfoInk, head: COLORS.brand },
  done: { bg: COLORS.doneBg, line: COLORS.doneLine, ink: COLORS.doneInk, head: COLORS.doneInk },
  warn: {
    bg: COLORS.noteWarn,
    line: COLORS.noteWarnLine,
    ink: COLORS.noteWarnInk,
    head: COLORS.noteWarnInk,
  },
};

function toneOf(request: VisitRequest): Tone {
  if (request.status === "confirmed" || request.status === "completed") return "done";
  if (request.status === "reschedule_proposed" || request.status === "cancelled") return "warn";
  return "info";
}

/**
 * 상태를 그림으로도 알린다. 글을 빨리 읽지 못해도 무슨 일인지 보인다.
 *
 * 알림 목록(`features/alerts`)이 쓰는 그림과 같은 계열로 맞춘다 — 같은 일을 두 화면이
 * 다른 그림으로 알리면 같은 일인지 알 수 없다.
 */
function iconOf(request: VisitRequest): IconName {
  switch (request.status) {
    case "confirmed":
    case "completed":
      return "checkCircle";
    case "reschedule_proposed":
      return "undo";
    case "cancelled":
      return "close";
    default:
      // 보냈고 아직 답을 기다리는 중이다.
      return "clock";
  }
}

function SmallButton({
  label,
  filled,
  danger,
  a11yLabel,
  onPress,
}: {
  label: string;
  filled?: boolean;
  /** 되돌릴 수 없는 쪽. 문구만으로는 무게가 전해지지 않아 색으로도 알린다. */
  danger?: boolean;
  /** 화면에 적힌 말이 짧을 때 읽어줄 말. 없으면 적힌 말을 그대로 읽는다. */
  a11yLabel?: string;
  onPress: () => void;
}) {
  const bg = danger ? COLORS.alert : filled ? COLORS.brand : COLORS.surface;
  const line = danger ? COLORS.alert : filled ? COLORS.brand : COLORS.line;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      className="rounded-lg border-[1.5px] px-4 py-3 active:opacity-90"
      style={{ backgroundColor: bg, borderColor: line }}
    >
      <Text
        className="text-caption font-extrabold"
        style={{ color: danger || filled ? COLORS.surface : COLORS.inkSub }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * 요청을 물리는 버튼 (2026-08-31 시안).
 *
 * **눈에 덜 띄게 둔다.** 물리는 것이 이 화면의 목적이 아니고, 크게 두면 기다리는
 * 동안 눌러 보게 된다. 다만 찾을 수는 있어야 한다.
 */
function CancelButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="이 방문 요청 취소하기"
      className="rounded-lg border-[1.5px] px-5 py-1 active:opacity-80"
      style={{ backgroundColor: COLORS.alertSoft, borderColor: COLORS.alertLine }}
    >
      <Text
        className="text-caption"
        style={{ color: COLORS.alert, fontFamily: FONTS.semibold }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function RequestStatusStrip({
  request,
  onOpenStaffChat,
  onResend,
  onCancel,
}: Props) {
  const tone = TONE_STYLE[toneOf(request)];
  const confirmed = request.status === "confirmed";
  // 확정된 요청만 한 번 더 묻는다. 담당자가 시간과 창구를 비워둔 상태라 무르는 값이
  // 다르다. 확정 전이면 묻지 않는다 — 확인 절차가 늘수록 그만두게 된다.
  const [confirming, setConfirming] = useState(false);

  // **지금 할 수 있는 일은 하나뿐이다.** 취소한 요청은 다시 보내고, 방이 열린 요청은
  // 담당자와 이야기한다. 두 가지가 동시에 오는 상태는 없으므로 자리를 하나만 둔다.
  const action =
    request.status === "cancelled" && onResend ? (
      <SmallButton label="다시 보내기" filled onPress={onResend} />
    ) : canOpenStaffChat(request.status) ? (
      <SmallButton
        label="이야기하기"
        a11yLabel="담당자와 이야기하기"
        onPress={onOpenStaffChat}
      />
    ) : null;

  // **오른쪽 자리는 하나다.** 할 수 있는 일이 있으면 그것이 먼저 오고, 없을 때만
  // 취소가 그 자리에 온다 (2026-08-31 시안). 한 번 더 묻는 상태에서는 확인 문구가
  // 아래로 펼쳐져야 하므로 오른쪽에 두지 않는다.
  const cancellable = Boolean(onCancel) && canCancel(request.status);
  const cancelInline = cancellable && !cancelNeedsConfirm(request.status) && action === null;

  return (
    <View
      className="mb-4 rounded-xl border px-4 py-4"
      style={{ backgroundColor: tone.bg, borderColor: tone.line }}
    >
      {/* **문구는 왼쪽, 할 수 있는 일은 오른쪽에 나란히 둔다.** 위아래로 쌓으면 카드가
          길어지고, 짧은 문구 아래에 버튼 하나만 덩그러니 남아 빈 칸처럼 보인다.
          문구가 길어지면 왼쪽 칸 안에서 접힌다 — 버튼을 밀어내지 않는다 */}
      <View className="flex-row items-start gap-1">
        {/* 글자 첫 줄에 맞춰 내린다. 위에 붙이면 상자 모서리에 닿아 보인다 */}
        <View className="shrink-0 pt-1">
          <Icon name={iconOf(request)} size={18} color={tone.head} />
        </View>

        {/* 첫 줄이 지금 상태이고 뒤따르는 줄은 부연이다. 무게를 달리해 눈으로 갈리게 한다. */}
        <View className="ml-1 flex-1">
          {statusLines(request).map((line, i) => (
            <Text
              key={line}
              className="leading-[24px]"
              style={{
                color: i === 0 ? tone.head : tone.ink,
                // 확정 문구는 실제로 찾아가야 할 정보를 담고 있으므로 더 크고 굵게 낸다.
                fontSize: confirmed ? 16 : i === 0 ? 14.5 : 14,
                fontFamily: i === 0 ? (confirmed ? FONTS.extrabold : FONTS.bold) : FONTS.regular,
                opacity: i === 0 ? 1 : 0.85,
              }}
            >
              {line}
            </Text>
          ))}
        </View>

        {action ? (
          <View className="shrink-0">{action}</View>
        ) : cancelInline && onCancel ? (
          <View className="shrink-0 pt-2">
            <CancelButton label="취소" onPress={() => void onCancel()} />
          </View>
        ) : null}
      </View>

      {/* **눈에 덜 띄게 둔다.** 물리는 것이 이 화면의 목적이 아니고, 크게 두면
          기다리는 동안 눌러 보게 된다. 다만 찾을 수는 있어야 한다 */}
      {onCancel && cancellable && !cancelInline ? (
        confirming ? (
          <View className="mt-3">
            <Text className="mb-2 text-caption" style={{ color: tone.ink }}>
              담당자가 시간을 비워 두었어요. 정말 안 가시겠어요?
            </Text>
            <View className="flex-row gap-2">
              <SmallButton
                label="네, 취소할래요"
                danger
                onPress={() => {
                  void Promise.resolve(onCancel()).then((ok) => {
                    if (ok === false) setConfirming(false);
                  });
                }}
              />
              <SmallButton label="아니요" onPress={() => setConfirming(false)} />
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => (cancelNeedsConfirm(request.status) ? setConfirming(true) : onCancel())}
            accessibilityRole="button"
            accessibilityLabel="이 방문 요청 취소하기"
            className="mt-3 self-start rounded-lg border-[1.5px] px-4 py-3 active:opacity-80"
            style={{ backgroundColor: COLORS.alertSoft, borderColor: COLORS.alertLine }}
          >
            <Text className="text-caption font-extrabold" style={{ color: COLORS.alert }}>
              취소하기
            </Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}
