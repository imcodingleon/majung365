// 요청 상세 (§7.1·§8.1).
//
// 담당자가 상태를 바꾸는 자리다. **확정할 때 만날 사람과 만날 장소를 받는다.**
// 그 두 값이 출소자 화면의 확정 문구를 이룬다. 빠지면 이 기능의 목적이 사라진다.
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NoteBox, NoteLine } from "@/shared/components/NoteBox";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { COLORS } from "@/shared/theme/colors";
import { josa } from "@/shared/utils/korean";

import { timeLabel } from "../domain/fromServer";

import {
  canConfirm,
  missingDocs,
  statusLabel,
  type ConfirmInput,
  type StaffRequest,
} from "../domain/staffRequest";

type Props = {
  request: StaffRequest;
  onAcknowledge: () => void;
  onConfirm: (input: ConfirmInput) => void;
  onProposeReschedule: (time: string) => void;
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

/**
 * 제안할 수 있는 시간 후보.
 *
 * **1·2지망이 아닌 시간을 담당자가 고를 수 있어야 한다** — 조율의 시작이 그것이다.
 * 다음 다섯 평일의 오전·오후를 낸다. 주민센터와 공단이 평일에만 열기 때문이다.
 */
function proposalSlots(request: StaffRequest): readonly { label: string; iso: string }[] {
  // **서버 값을 그대로 믿지 않는다.** 파싱되지 않는 시각이 오면 Invalid Date가 되고,
  // 그 뒤 `toISOString()`이 RangeError를 던져 **요청 상세 화면이 렌더 도중에 터진다.**
  // **1지망 날짜를 기준으로 삼되 오늘보다 앞설 수는 없다.** 20일에 들어온 21일 요청을
  // 담당자가 27일에 열면 24·25·26일이 후보로 나오고, 그것을 고르면 **이미 지난 날짜가
  // 제안으로 올라가 사용자 화면에 뜬다.**
  const parsed = request.firstChoiceAt ? new Date(request.firstChoiceAt) : null;
  const wanted = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  const today = new Date();
  const base = wanted.getTime() > today.getTime() ? wanted : today;

  const out: { label: string; iso: string }[] = [];
  const cursor = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  // 다섯 평일 × 오전·오후. 한 번에 둘을 넣으므로 열까지 채운다.
  while (out.length < 10) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day === 0 || day === 6) continue;
    for (const hour of [10, 15]) {
      const at = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), hour);
      out.push({ label: timeLabel(at.toISOString()), iso: at.toISOString() });
    }
  }
  return out;
}

export function RequestDetailScreen({
  request,
  onAcknowledge,
  onConfirm,
  onProposeReschedule,
  onCancel,
  onOpenChat,
  onBack,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [input, setInput] = useState<ConfirmInput>({
    whenLabel: request.firstChoice,
    whenIso: request.firstChoiceAt,
    staffName: "",
    place: "",
  });
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

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
          <Field label="1지망" value={request.firstChoice} />
          <Field label="2지망" value={request.secondChoice} />
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
                  <Text
                    className="text-body-lg font-extrabold"
                    style={{ color: ready ? COLORS.doneInk : COLORS.alert }}
                  >
                    {ready ? "✓" : "✕"}
                  </Text>
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
            <Text className="mb-2 mt-8 text-body-lg font-extrabold text-ink-strong">
              본인이 미리 알려 온 것
            </Text>
            {/* **말하지 않은 것을 물으면 안 된다.** 창구에서 다시 설명하지 않아도 되게
                하려고 미리 받은 답이므로, 이 목록이 상담 범위를 넓히는 근거가 아니다 */}
            <Text className="mb-3 text-caption text-ink-sub">
              본인이 동의해 보낸 내용입니다. 여기 없는 것은 묻지 않으셔도 됩니다.
            </Text>
            <View className="rounded-2xl bg-white px-4 py-2">
              {request.sharedAnswers.map((answer, index) => (
                <View
                  key={`${answer.route_id}-${index}`}
                  className={index === 0 ? "py-3" : "border-t border-line py-3"}
                >
                  <Text className="text-caption font-bold text-ink-header">{answer.section}</Text>
                  <Text className="mt-1 text-body text-ink-sub">{answer.question}</Text>
                  <Text className="mt-1 text-body-lg font-bold text-ink-strong">
                    {answer.answer}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <View className="mt-8">
          {request.status === "sent" ? (
            <Button label="확인했습니다" tone="primary" onPress={onAcknowledge} />
          ) : null}

          {request.status === "acknowledged" || request.status === "reschedule_proposed" ? (
            <>
              {!confirming ? (
                <Button label="방문 시간 확정하기" tone="primary" onPress={() => setConfirming(true)} />
              ) : (
                <View className="mb-4 rounded-2xl border-[1.5px] border-brand-soft bg-white p-4">
                  {/* 만날 사람과 만날 장소가 이 기능의 핵심이다 (§7.1). */}
                  <Text className="mb-3 text-body text-ink-sub">
                    확정하면 출소자 화면에 시간과 함께 누구를 어디서 만나면 되는지 뜹니다.
                  </Text>

                  <Text className="mb-2 text-caption font-bold text-ink-header">방문 시간</Text>
                  <View className="mb-4 flex-row flex-wrap gap-2">
                    {/* 라벨과 원본 시각을 짝지어 고르게 한다. 라벨만 들고 있으면 서버에
                        보낼 시각을 되짚을 수 없어 **1지망으로 확정된 것처럼 되어 버린다** */}
                    {[
                      { label: request.firstChoice, iso: request.firstChoiceAt },
                      { label: request.secondChoice, iso: request.secondChoiceAt },
                    ]
                      .filter((s) => s.label)
                      .map(({ label: slot, iso }) => (
                      <Pressable
                        key={slot}
                        onPress={() => setInput((p) => ({ ...p, whenLabel: slot, whenIso: iso }))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: input.whenLabel === slot }}
                        accessibilityLabel={slot}
                        className="rounded-xl border-[1.5px] px-4 py-3 active:opacity-80"
                        style={{
                          backgroundColor:
                            input.whenLabel === slot ? COLORS.brandSoft : COLORS.surface,
                          borderColor: input.whenLabel === slot ? COLORS.brand : COLORS.line,
                        }}
                      >
                        <Text
                          className="text-caption"
                          style={{
                            color: input.whenLabel === slot ? COLORS.brand : COLORS.inkStrong,
                            fontWeight: input.whenLabel === slot ? "800" : "600",
                          }}
                        >
                          {slot}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

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
                    disabled={!canConfirm(input)}
                    onPress={() => {
                      onConfirm(input);
                      setConfirming(false);
                    }}
                  />
                  {!canConfirm(input) ? (
                    <Text className="mb-2 text-center text-caption text-ink-muted">
                      만날 사람과 장소를 모두 적어야 확정할 수 있습니다.
                    </Text>
                  ) : null}
                  <Button label="그만두기" tone="ghost" onPress={() => setConfirming(false)} />
                </View>
              )}

              {/* **후보에서 고르게 한다.** 서버가 받는 것은 시각이지 문구가 아니어서,
                  자유 입력은 거부된다(422). 그리고 담당자가 "다음 주쯤"처럼 적으면
                  출소자 화면에 언제인지가 안 뜬다 */}
              <Text className="mb-2 mt-2 text-caption font-bold text-ink-header">
                다른 시간 제안하기
              </Text>
              <View className="mb-2 flex-row flex-wrap gap-2">
                {proposalSlots(request).map(({ label, iso }) => (
                  <Pressable
                    key={iso}
                    onPress={() => onProposeReschedule(iso)}
                    accessibilityRole="button"
                    accessibilityLabel={`${label}${josa(label, "으로", "로")} 제안하기`}
                    className="rounded-xl border-[1.5px] border-line bg-white px-4 py-3 active:opacity-80"
                  >
                    <Text className="text-caption font-bold text-ink-sub">{label}</Text>
                  </Pressable>
                ))}
              </View>
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
