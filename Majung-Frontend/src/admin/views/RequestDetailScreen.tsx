// 요청 상세 (§7.1·§8.1).
//
// 담당자가 상태를 바꾸는 자리다. **확정할 때 만날 사람과 만날 장소를 받는다.**
// 그 두 값이 출소자 화면의 확정 문구를 이룬다. 빠지면 이 기능의 목적이 사라진다.
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NoteBox, NoteLine } from "@/shared/components/NoteBox";
import { VisitTimeField } from "@/shared/components/VisitTimeField";
import { Icon } from "@/shared/components/Icon";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { COLORS } from "@/shared/theme/colors";
import { josa } from "@/shared/utils/korean";
import { fromIso, isComplete, toIso, type VisitTime } from "@/shared/utils/visitTime";

import { timeLabel } from "../domain/fromServer";

import {
  canConfirm,
  missingDocs,
  parseSummary,
  statusLabel,
  type ConfirmInput,
  type StaffRequest,
} from "../domain/staffRequest";

/**
 * 요약이 채워지기를 기다리는 시간.
 *
 * 모델이 답하는 데 보통 몇 초면 되고, 그 사이 담당자는 위쪽 준비물과 하고 싶은
 * 말을 읽는다. 너무 짧으면 아직 없는 것을 확인하려고 또 부르는 셈이 된다.
 */
const SUMMARY_RECHECK_MS = 6000;

type Props = {
  request: StaffRequest;
  /** 요약이 늦게 채워졌을 때 목록을 다시 부른다. 없으면 다시 부르지 않는다. */
  onReload?: () => void;
  onAcknowledge: () => void;
  onConfirm: (input: ConfirmInput) => void;
  onCancel: (reason: string) => void;
  onOpenChat: () => void;
  onBack: () => void;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View className="border-b border-line py-4">
      <Text className="text-caption font-bold text-ink-header">{label}</Text>
      <Text className="mt-1 text-body-lg text-ink-strong">{value}</Text>
    </View>
  );
}

function Button({
  label,
  tone,
  disabled,
  onPress,
}: {
  label: string;
  tone: "primary" | "ghost" | "danger";
  disabled?: boolean;
  onPress: () => void;
}) {
  const bg =
    tone === "primary" ? COLORS.brand : tone === "danger" ? COLORS.surface : COLORS.surface;
  const border =
    tone === "primary" ? COLORS.brand : tone === "danger" ? COLORS.alertLine : COLORS.line;
  const ink = tone === "primary" ? COLORS.surface : tone === "danger" ? COLORS.alert : COLORS.inkSub;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      className="mb-2 items-center rounded-xl border-[1.5px] py-4 active:opacity-90"
      style={{
        backgroundColor: disabled && tone === "primary" ? COLORS.brandMuted : bg,
        borderColor: disabled && tone === "primary" ? COLORS.brandMuted : border,
      }}
    >
      <Text className="text-body-lg font-extrabold" style={{ color: ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function RequestDetailScreen({
  request,
  onReload,
  onAcknowledge,
  onConfirm,
  onCancel,
  onOpenChat,
  onBack,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [input, setInput] = useState({ staffName: "", place: "" });
  /**
   * 만나기로 할 때. **처음 값은 출소자가 적어낸 때다** (2026-08-26 결정).
   *
   * 빈 칸에서 시작하면 담당자가 상대가 원한 때를 보면서 옮겨 적어야 한다. 그대로
   * 두면 손대지 않은 것이고, 안 되는 때면 그 자리에서 고쳐 확정한다.
   */
  const [when, setWhen] = useState<VisitTime>(() => fromIso(request.wantedAt));
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  /**
   * 답한 내용을 그대로 펼쳤는가 (§7.4).
   *
   * **요약이 없으면 처음부터 펼쳐 둔다.** 접는 것은 요약이 대신 읽어 줄 때만
   * 뜻이 있고, 요약을 만들지 못했는데 접혀 있으면 담당자는 한 번 더 눌러야
   * 원래 보던 것을 본다.
   */
  const summary = useMemo(
    () => (request.summaryStatus === "ready" ? parseSummary(request.summary) : null),
    [request.summaryStatus, request.summary],
  );
  const summarised = summary !== null;
  const [showRaw, setShowRaw] = useState(!summarised);
  const showToggle = summarised;

  // 요약이 늦게 채워져도 담당자가 화면을 닫았다 열지 않아도 되게 한 번만 다시 부른다.
  //
  // **되풀이해 두드리지 않는다.** 담당자 목록은 요청 하나마다 대화까지 읽어 오므로
  // 짧은 주기로 다시 부르면 조회가 요청 수만큼 계속 늘어난다.
  useEffect(() => {
    if (request.summaryStatus !== "pending" || !onReload) return;
    const timer = setTimeout(() => onReload(), SUMMARY_RECHECK_MS);
    return () => clearTimeout(timer);
  }, [request.id, request.summaryStatus, onReload]);

  // 다른 요청을 열 때만 접힘을 다시 잡는다.
  //
  // **요약이 늦게 도착해도 펼쳐 둔 것을 접지 않는다.** `summarised`를 함께 보면,
  // 기다리는 동안 원문을 읽던 담당자의 화면이 6초 뒤에 저 혼자 접힌다.
  // 요약은 위에 새로 나타나므로 접지 않아도 놓치는 것이 없다.
  useEffect(() => {
    setShowRaw(parseSummary(request.summaryStatus === "ready" ? request.summary : "") === null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id]);

  // 오늘은 렌더마다 새로 만들지 않는다. 매번 새 객체면 고르기 목록이 계속 다시 만들어진다.
  const today = useMemo(() => new Date(), []);
  const confirmInput: ConfirmInput = { ...input, whenIso: toIso(when) };

  const missing = missingDocs(request);
  const box =
    "rounded-xl border-[1.5px] border-line bg-white px-4 py-4 text-body-lg text-ink-strong";

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
      <ScreenHeader
        title={request.name}
        eyebrow={statusLabel(request.status)}
        leading="back"
        closeHint="요청 목록으로 돌아가기"
        onClose={onBack}
      />

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-12 pt-4">
        <View className="rounded-2xl bg-white px-4">
          {/* 방문 목적이다. 죄목이 아니며 담당자에게 죄목은 전달되지 않는다 (§7.4). */}
          <Field label="무슨 일로 오시나요" value={request.purpose} />
          <Field label="오시겠다는 때" value={request.wantedLabel} />
          {request.releaseDate ? <Field label="출소한 날" value={request.releaseDate} /> : null}
          {request.note ? <Field label="하고 싶은 말" value={request.note} /> : null}
        </View>

        {/* 담당자가 미리 알면 헛걸음을 막는다 (§7.2). */}
        <Text className="mb-3 mt-6 text-body-lg font-extrabold text-ink-strong">준비물</Text>
        <View className="rounded-2xl bg-white px-4 py-4">
          {request.allDocs.length === 0 ? (
            <Text className="text-body text-ink-sub">준비물이 없습니다.</Text>
          ) : (
            request.allDocs.map((doc) => {
              const ready = request.readyDocs.includes(doc);
              return (
                <View key={doc} className="flex-row items-center gap-3 py-2">
                  <Icon
                    name={ready ? "check" : "close"}
                    size={20}
                    color={ready ? COLORS.doneInk : COLORS.alert}
                  />
                  <Text className="flex-1 text-body text-ink-strong">{doc}</Text>
                </View>
              );
            })
          )}
        </View>

        {missing.length > 0 ? (
          <NoteBox tone="warn" className="mt-3">
            <NoteLine tone="warn">
              {missing.join(" · ")}
              {josa(missing[missing.length - 1], "을", "를")} 안 가져오십니다. 미리 안내가 필요합니다.
            </NoteLine>
          </NoteBox>
        ) : null}

        {/* 본인이 함께 보내기로 한 답변 (§7.4-1).
            **동의하지 않았으면 구역 자체가 없다.** 빈 구역을 두면 "동의를 안 했구나"가
            드러나고, 그것 자체가 담당자에게 주는 정보가 된다.
            순서는 서버가 방문 목적에 가깝게 정렬해 보낸 것이므로 건드리지 않는다 */}
        {request.sharedAnswers.length > 0 ? (
          <>
            <Text className="mb-3 mt-8 text-body-lg font-extrabold text-ink-strong">
              본인이 미리 알려 온 것
            </Text>

            {/* 요약을 먼저 놓는다 (§7.4). **원문을 대체하지 않는다** — 만들지
                못했으면 아래 원문이 처음부터 펼쳐진다.
                **조각으로 그린다** (2026-08-31). 문단 하나로 붙여 놓으니 담당자가
                창구에서 훑지 못하고 원문을 읽는 것과 다르지 않았다 */}
            {summary ? (
              <View className="overflow-hidden rounded-2xl border-[1.5px] border-brand-soft bg-white">
                <View className="border-b border-brand-soft bg-brand-soft/40 px-4 py-3">
                  <Text className="text-caption font-bold text-brand">
                    출소자 응답 요약 (AI 요약)
                  </Text>
                </View>

                <View className="px-4 py-4">
                  {summary.headline ? (
                    <Text className="text-body-lg font-bold leading-7 text-ink-strong">
                      {summary.headline}
                    </Text>
                  ) : null}

                  {/* 옛 형식으로 저장된 요약. 조각이 아니라 통째로 그린다 */}
                  {summary.paragraph ? (
                    <Text className="text-body-lg leading-7 text-ink-strong">
                      {summary.paragraph}
                    </Text>
                  ) : null}

                  {summary.points.length > 0 ? (
                    <View className="mt-4 rounded-xl bg-page px-4 py-1">
                      {summary.points.map((point, index) => (
                        <View
                          key={`${point.label}-${index}`}
                          className={index === 0 ? "py-3" : "border-t border-line py-3"}
                        >
                          {point.label ? (
                            <Text className="mb-1 text-caption font-bold text-ink-header">
                              {point.label}
                            </Text>
                          ) : null}
                          <Text className="text-body leading-6 text-ink-strong">
                            {point.text}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {summary.prepare.length > 0 ? (
                    <View className="mt-4">
                      <Text className="mb-2 text-caption font-bold text-ink-header">
                        미리 챙기면 좋은 것
                      </Text>
                      {summary.prepare.map((item) => (
                        <View key={item} className="mb-1 flex-row gap-2">
                          <Text className="text-body text-ink-muted">·</Text>
                          <Text className="flex-1 text-body leading-6 text-ink-sub">
                            {item}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>

                {/* **간추린 것임을 밝힌다.** 담당자가 이것을 본인이 쓴 말로 읽으면,
                    없는 말을 근거로 응대하게 된다 */}
                <View className="border-t border-line px-4 py-3">
                  <Text className="text-caption text-ink-muted">
                    본인이 답한 내용을 간추린 것입니다. 그대로 옮긴 말은 아닙니다.
                  </Text>
                </View>
              </View>
            ) : null}

            {request.summaryStatus === "pending" ? (
              <NoteBox tone="info">
                <NoteLine tone="info">
                  요약을 만들고 있습니다. 아래 답한 내용을 먼저 보셔도 됩니다.
                </NoteLine>
              </NoteBox>
            ) : null}

            {/* 요약이 있을 때만 접는다. 없으면 접을 이유가 없다 — 담당자가 볼 것이
                사라지는 경우를 만들지 않는다 */}
            {showToggle ? (
              <Pressable
                onPress={() => setShowRaw((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showRaw }}
                accessibilityLabel={
                  showRaw
                    ? "본인이 답한 내용 접기"
                    : `본인이 답한 내용 ${request.sharedAnswers.length}가지 펼쳐 보기`
                }
                className="mt-3 rounded-2xl border-[1.5px] border-dashed border-line px-4 py-4 active:opacity-80"
              >
                <Text className="text-body font-semibold text-ink-sub">
                  {showRaw
                    ? "답한 내용 접기 ⌃"
                    : `본인이 답한 그대로 보기 (${request.sharedAnswers.length}가지) ⌄`}
                </Text>
              </Pressable>
            ) : null}

            {showRaw ? (
              <View className="mt-3 rounded-2xl bg-white px-4 py-2">
                {request.sharedAnswers.map((answer, index) => (
                  <View
                    key={`${answer.route_id}-${index}`}
                    className={index === 0 ? "py-3" : "border-t border-line py-3"}
                  >
                    <Text className="text-caption font-bold text-ink-header">
                      {answer.section}
                    </Text>
                    <Text className="mt-1 text-body text-ink-sub">{answer.question}</Text>
                    <Text className="mt-1 text-body-lg font-bold text-ink-strong">
                      {answer.answer}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        <View className="mt-8">
          {request.status === "sent" ? (
            <Button label="확인했습니다" tone="primary" onPress={onAcknowledge} />
          ) : null}

          {request.status === "acknowledged" ? (
            <>
              {!confirming ? (
                <Button label="방문 시간 확정하기" tone="primary" onPress={() => setConfirming(true)} />
              ) : (
                <View className="mb-4 rounded-2xl border-[1.5px] border-brand-soft bg-white p-4">
                  {/* 만날 사람과 만날 장소가 이 기능의 핵심이다 (§7.1). */}
                  {/* **시각은 우리가 정하지 않는다.** 출소자가 적어낸 때가 그대로
                      확정 시각이 되고, 세부 조율은 채팅으로 한다 (§7.3). 시스템이
                      시각을 다시 고르게 하면 담당자가 그 자리에서 결정해야 하는데,
                      정작 상대와 이야기해 봐야 아는 일이다 */}
                  <Text className="mb-4 text-body text-ink-sub">
                    확정하면 출소자 화면에 언제 누구를 어디서 만나면 되는지 뜹니다.
                  </Text>

                  {/* **때를 바꿀 수 있다** (2026-08-26 결정). 기관이 언제 문을 여는지는
                      담당자가 알고, 안 되는 때를 채팅으로만 조율하면 확정까지 하루가
                      더 걸린다. 처음 값은 출소자가 적어낸 때다 */}
                  <Text className="mb-2 text-caption font-bold text-ink-header">만날 때</Text>
                  <VisitTimeField
                    value={when}
                    onChange={setWhen}
                    label="만날 때"
                    today={today}
                    titles={{
                      month: "몇 월에 만나시나요",
                      day: "며칠에 만나시나요",
                      hour: "몇 시에 만나시나요",
                    }}
                  />
                  <Text className="mb-4 mt-2 text-caption text-ink-muted">
                    {isComplete(when)
                      ? "본인이 적어낸 때입니다. 안 되시면 바꿔 주세요."
                      : "만날 때를 골라 주세요."}
                  </Text>

                  <Text className="mb-2 text-caption font-bold text-ink-header">만날 담당자 이름</Text>
                  <TextInput
                    className={`${box} mb-4`}
                    value={input.staffName}
                    onChangeText={(t) => setInput((p) => ({ ...p, staffName: t }))}
                    placeholder="예: 최다은"
                    placeholderTextColor={COLORS.inkMuted}
                    accessibilityLabel="만날 담당자 이름"
                  />

                  <Text className="mb-2 text-caption font-bold text-ink-header">만날 장소</Text>
                  <TextInput
                    className={`${box} mb-4`}
                    value={input.place}
                    onChangeText={(t) => setInput((p) => ({ ...p, place: t }))}
                    placeholder="예: 2층 상담실"
                    placeholderTextColor={COLORS.inkMuted}
                    accessibilityLabel="만날 장소"
                  />

                  <Button
                    label="이대로 확정"
                    tone="primary"
                    disabled={!canConfirm(confirmInput)}
                    onPress={() => {
                      onConfirm(confirmInput);
                      setConfirming(false);
                    }}
                  />
                  {!canConfirm(confirmInput) ? (
                    <Text className="mb-2 text-center text-caption text-ink-muted">
                      만날 때와 사람, 장소를 모두 정해야 확정할 수 있습니다.
                    </Text>
                  ) : null}
                  <Button label="그만두기" tone="ghost" onPress={() => setConfirming(false)} />
                </View>
              )}

            </>
          ) : null}

          {/* 담당자가 확인하기 전에는 채팅을 열지 않는다 (§7.3-4). */}
          {request.status !== "sent" && request.status !== "cancelled" ? (
            <Button label="출소자와 이야기하기" tone="ghost" onPress={onOpenChat} />
          ) : null}

          {request.status !== "cancelled" && request.status !== "completed" ? (
            <>
              {!cancelling ? (
                <Button label="이 요청 취소하기" tone="danger" onPress={() => setCancelling(true)} />
              ) : (
                <View className="rounded-2xl border-[1.5px] border-alert-line bg-white p-4">
                  {/* 취소 사유는 출소자 화면에 그대로 보인다 (§7.1). */}
                  <Text className="mb-2 text-body text-ink-sub">
                    적으신 이유가 출소자에게 그대로 보입니다.
                  </Text>
                  <TextInput
                    className={`${box} mb-3`}
                    value={cancelReason}
                    onChangeText={setCancelReason}
                    placeholder="예: 그날 지부 일정이 있어 어렵습니다."
                    placeholderTextColor={COLORS.inkMuted}
                    accessibilityLabel="취소 이유"
                  />
                  <Button
                    label="취소 보내기"
                    tone="danger"
                    disabled={!cancelReason.trim()}
                    onPress={() => {
                      onCancel(cancelReason.trim());
                      setCancelling(false);
                      setCancelReason("");
                    }}
                  />
                  <Button label="그만두기" tone="ghost" onPress={() => setCancelling(false)} />
                </View>
              )}
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
