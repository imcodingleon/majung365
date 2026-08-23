// 요청 상세 (§7.1·§8.1).
//
// 담당자가 상태를 바꾸는 자리다. **확정할 때 만날 사람과 만날 장소를 받는다.**
// 그 두 값이 출소자 화면의 확정 문구를 이룬다. 빠지면 이 기능의 목적이 사라진다.
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "@/shared/theme/colors";

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
    <View className="border-b border-line py-3.5">
      <Text className="text-[13px] font-bold text-ink-header">{label}</Text>
      <Text className="mt-1 text-base leading-[25px] text-ink-strong">{value}</Text>
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
      className="mb-2 items-center rounded-xl border-[1.5px] py-3.5 active:opacity-90"
      style={{
        backgroundColor: disabled && tone === "primary" ? COLORS.brandMuted : bg,
        borderColor: disabled && tone === "primary" ? COLORS.brandMuted : border,
      }}
    >
      <Text className="text-base font-extrabold" style={{ color: ink }}>
        {label}
      </Text>
    </Pressable>
  );
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
    staffName: "",
    place: "",
  });
  const [proposal, setProposal] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const missing = missingDocs(request);
  const box =
    "rounded-xl border-[1.5px] border-line bg-white px-4 py-3.5 text-base text-ink-strong";

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
      <View className="flex-row items-center gap-3 border-b border-line bg-white px-5 py-4">
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="목록으로"
          className="size-10 items-center justify-center rounded-full active:opacity-70"
        >
          <Text className="text-2xl text-ink-muted">‹</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-lg font-extrabold text-ink-strong">{request.name}</Text>
          <Text className="text-[13px] text-ink-muted">{statusLabel(request.status)}</Text>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-12 pt-4">
        <View className="rounded-2xl bg-white px-4">
          <Field label="무슨 일로" value={request.purpose} />
          <Field label="1지망" value={request.firstChoice} />
          <Field label="2지망" value={request.secondChoice} />
          {request.releaseDate ? <Field label="출소한 날" value={request.releaseDate} /> : null}
          {request.note ? <Field label="하고 싶은 말" value={request.note} /> : null}
        </View>

        {/* 담당자가 미리 알면 헛걸음을 막는다 (§7.2). */}
        <Text className="mb-2.5 mt-6 text-base font-extrabold text-ink-strong">준비물</Text>
        <View className="rounded-2xl bg-white px-4 py-3.5">
          {request.allDocs.length === 0 ? (
            <Text className="text-[15px] text-ink-sub">필요한 준비물이 없습니다.</Text>
          ) : (
            request.allDocs.map((doc) => {
              const ready = request.readyDocs.includes(doc);
              return (
                <View key={doc} className="flex-row items-center gap-2.5 py-1.5">
                  <Text
                    className="text-base font-extrabold"
                    style={{ color: ready ? COLORS.doneInk : COLORS.alert }}
                  >
                    {ready ? "✓" : "✕"}
                  </Text>
                  <Text className="flex-1 text-[15px] text-ink-strong">{doc}</Text>
                </View>
              );
            })
          )}
        </View>

        {missing.length > 0 ? (
          <View className="mt-2.5 rounded-xl border border-note-warn-line bg-note-warn px-4 py-3.5">
            <Text className="text-sm leading-[23px] text-note-warn-ink">
              {missing.join(" · ")}을(를) 안 가져오십니다. 미리 안내가 필요합니다.
            </Text>
          </View>
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
                  <Text className="mb-3 text-[15px] leading-[24px] text-ink-sub">
                    확정하면 출소자 화면에 시간과 함께 누구를 어디서 찾으면 되는지가 뜹니다.
                  </Text>

                  <Text className="mb-2 text-sm font-bold text-ink-header">방문 시간</Text>
                  <View className="mb-4 flex-row flex-wrap gap-2">
                    {[request.firstChoice, request.secondChoice].map((slot) => (
                      <Pressable
                        key={slot}
                        onPress={() => setInput((p) => ({ ...p, whenLabel: slot }))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: input.whenLabel === slot }}
                        accessibilityLabel={slot}
                        className="rounded-xl border-[1.5px] px-3.5 py-3 active:opacity-80"
                        style={{
                          backgroundColor:
                            input.whenLabel === slot ? COLORS.brandSoft : COLORS.surface,
                          borderColor: input.whenLabel === slot ? COLORS.brand : COLORS.line,
                        }}
                      >
                        <Text
                          className="text-sm"
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

                  <Text className="mb-2 text-sm font-bold text-ink-header">만날 담당자 이름</Text>
                  <TextInput
                    className={`${box} mb-4`}
                    value={input.staffName}
                    onChangeText={(t) => setInput((p) => ({ ...p, staffName: t }))}
                    placeholder="예: 최다은"
                    placeholderTextColor={COLORS.inkMuted}
                    accessibilityLabel="만날 담당자 이름"
                  />

                  <Text className="mb-2 text-sm font-bold text-ink-header">만날 장소</Text>
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
                    <Text className="mb-2 text-center text-sm text-ink-muted">
                      만날 사람과 장소를 모두 적어야 확정할 수 있습니다.
                    </Text>
                  ) : null}
                  <Button label="그만두기" tone="ghost" onPress={() => setConfirming(false)} />
                </View>
              )}

              <Text className="mb-2 mt-2 text-sm font-bold text-ink-header">
                다른 시간을 제안하기
              </Text>
              <View className="mb-2 flex-row gap-2">
                <TextInput
                  className={`${box} flex-1`}
                  value={proposal}
                  onChangeText={setProposal}
                  placeholder="예: 8월 27일 목요일 오후"
                  placeholderTextColor={COLORS.inkMuted}
                  accessibilityLabel="제안할 시간"
                />
                <Pressable
                  onPress={() => {
                    if (!proposal.trim()) return;
                    onProposeReschedule(proposal.trim());
                    setProposal("");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="시간 제안 보내기"
                  className="justify-center rounded-xl border-[1.5px] border-line bg-white px-4 active:opacity-90"
                >
                  <Text className="text-base font-bold text-ink-sub">보내기</Text>
                </Pressable>
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
                  <Text className="mb-2 text-[15px] leading-[24px] text-ink-sub">
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
