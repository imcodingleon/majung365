// 담당자 방문 알림 폼 (§7.2).
//
// 미리 알려두면 방문했을 때 설명할 필요 없이 바로 도와줄 수 있다. 창구에서 신분이 드러나는
// 순간이 실질적 장벽이라는 인터뷰 결과의 해법이 이것이다.
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "@/shared/theme/colors";

import { sharedItems } from "../domain/request";
import { buildTimeSlots, type TimeSlot } from "../domain/timeSlots";

type Props = {
  visible: boolean;
  /** 인사말과 같은 이름. 매번 손으로 입력하게 하면 부담이 커진다 (§2.5-2). */
  userName: string;
  /** 무슨 일로 가는지. 할 일 이름이 그대로 들어온다. */
  purpose: string;
  /** 이 할 일의 준비물 목록. 담당자가 미리 알면 헛걸음을 막는다. */
  docs: readonly string[];
  /** 기한이 있는 제도를 상담하는 자리인지. 그때만 출소날짜를 함께 보낸다 (§7.4). */
  hasDeadline?: boolean;
  /** 시간 후보를 만들 기준 날짜. 넘기지 않으면 오늘로 잡는다. */
  today?: Date;
  onSubmit: (payload: {
    firstChoice: string;
    secondChoice: string;
    readyDocs: readonly string[];
    note?: string;
  }) => void;
  onClose: () => void;
};

function SlotPicker({
  slots,
  selected,
  disabledId,
  onSelect,
}: {
  slots: readonly TimeSlot[];
  selected: string | null;
  /** 다른 지망에서 이미 고른 시간. 같은 시간을 두 번 고르게 두지 않는다. */
  disabledId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {slots.map((slot) => {
        const isSelected = selected === slot.id;
        const isDisabled = disabledId === slot.id;
        return (
          <Pressable
            key={slot.id}
            onPress={() => onSelect(slot.id)}
            disabled={isDisabled}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected, disabled: isDisabled }}
            accessibilityLabel={slot.label}
            className="rounded-xl border-[1.5px] px-4 py-3 active:opacity-80"
            style={{
              backgroundColor: isSelected ? COLORS.brandSoft : COLORS.surface,
              borderColor: isSelected ? COLORS.brand : COLORS.line,
              opacity: isDisabled ? 0.4 : 1,
            }}
          >
            <Text
              className="text-body"
              style={{
                color: isSelected ? COLORS.brand : COLORS.inkStrong,
                fontWeight: isSelected ? "800" : "600",
              }}
            >
              {slot.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text className="mb-3 mt-6 text-body-lg font-extrabold text-ink-strong">{children}</Text>;
}

export function VisitRequestSheet({
  visible,
  userName,
  purpose,
  docs,
  hasDeadline,
  today,
  onSubmit,
  onClose,
}: Props) {
  const slots = useMemo(() => buildTimeSlots(today ?? new Date()), [today]);
  const [first, setFirst] = useState<string | null>(null);
  const [second, setSecond] = useState<string | null>(null);
  const [readyDocs, setReadyDocs] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const canSend = first !== null && second !== null;

  const toggleDoc = (doc: string) => {
    setReadyDocs((prev) => (prev.includes(doc) ? prev.filter((d) => d !== doc) : [...prev, doc]));
  };

  const send = () => {
    if (!first || !second) return;
    onSubmit({
      firstChoice: first,
      secondChoice: second,
      readyDocs,
      note: note.trim() ? note.trim() : undefined,
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
        <View className="flex-row items-center justify-between border-b border-line bg-white px-5 py-4">
          <Text className="text-heading font-extrabold text-ink-strong">담당자에게 미리 알리기</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="닫기"
            className="size-10 items-center justify-center rounded-full active:opacity-70"
          >
            <Text className="text-2xl text-ink-muted">✕</Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-10 pt-5"
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-body text-ink-sub">
            미리 알려두면 가셨을 때 설명하지 않아도 돼요.{"\n"}
            바로 도와드릴 수 있어요.
          </Text>

          <SectionTitle>가시는 분</SectionTitle>
          <View className="rounded-xl border-[1.5px] border-line bg-line px-4 py-4">
            <Text className="text-body-lg text-ink-strong">{userName}</Text>
          </View>

          <SectionTitle>무슨 일로 가시나요</SectionTitle>
          <View className="rounded-xl border-[1.5px] border-line bg-line px-4 py-4">
            <Text className="text-body-lg text-ink-strong">{purpose}</Text>
          </View>

          {/* 1지망이 안 될 때 조율 왕복이 한 번 줄어든다 (§7.2). */}
          <SectionTitle>언제 가실 수 있나요</SectionTitle>
          <Text className="mb-3 text-caption text-ink-muted">
            가시고 싶은 때를 고르세요.{"\n"}
            주민센터와 공단은 평일에만 문을 열어요.
          </Text>
          <SlotPicker slots={slots} selected={first} disabledId={second} onSelect={setFirst} />

          <SectionTitle>그때가 안 되면 언제가 좋으세요</SectionTitle>
          <SlotPicker slots={slots} selected={second} disabledId={first} onSelect={setSecond} />

          {docs.length > 0 ? (
            <>
              <SectionTitle>챙겨 가실 것</SectionTitle>
              <Text className="mb-3 text-caption text-ink-muted">
                가지고 계신 것에 표시해 주세요.{"\n"}
                없어도 괜찮아요. 담당자가 미리 알면 헛걸음을 막을 수 있어요.
              </Text>
              {docs.map((doc) => {
                const checked = readyDocs.includes(doc);
                return (
                  <Pressable
                    key={doc}
                    onPress={() => toggleDoc(doc)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={doc}
                    className="mb-2 flex-row items-center gap-3 rounded-xl border-[1.5px] px-4 py-4 active:opacity-80"
                    style={{
                      backgroundColor: checked ? COLORS.brandSoft : COLORS.surface,
                      borderColor: checked ? COLORS.brand : COLORS.line,
                    }}
                  >
                    <View
                      className="size-6 items-center justify-center rounded-md border-2"
                      style={{
                        backgroundColor: checked ? COLORS.brand : COLORS.surface,
                        borderColor: checked ? COLORS.brand : COLORS.brandMuted,
                      }}
                    >
                      {checked ? <Text className="text-caption font-extrabold text-white">✓</Text> : null}
                    </View>
                    <Text className="flex-1 text-body-lg text-ink-strong">{doc}</Text>
                  </Pressable>
                );
              })}
            </>
          ) : null}

          <SectionTitle>하고 싶은 말</SectionTitle>
          <Text className="mb-3 text-caption text-ink-muted">
            안 적으셔도 괜찮아요.
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="미리 알려두고 싶은 것이 있으면 적어 주세요"
            placeholderTextColor={COLORS.inkMuted}
            accessibilityLabel="하고 싶은 말"
            className="min-h-24 rounded-xl border-[1.5px] border-line bg-white px-4 py-4 text-body-lg text-ink-strong"
            textAlignVertical="top"
          />

          {/* 무엇이 담당자에게 가는지 전송 직전에 보여준다 (§7.4). */}
          <View className="mt-6 rounded-xl border border-note-info-line bg-note-info px-4 py-4">
            <Text className="mb-2 text-body font-extrabold text-note-info-ink">
              담당자에게 이만큼만 알려줘요
            </Text>
            {sharedItems(note.trim().length > 0, Boolean(hasDeadline), docs.length > 0).map((item) => (
              <Text key={item} className="text-caption text-note-info-ink">
                · {item}
              </Text>
            ))}
            <Text className="mt-2 text-caption text-note-info-ink">
              어떤 일로 계셨는지는 알려주지 않아요.
            </Text>
          </View>

          <Pressable
            onPress={send}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend }}
            accessibilityLabel="알림 보내기"
            className="mt-5 items-center rounded-2xl py-4 active:opacity-90"
            style={{ backgroundColor: canSend ? COLORS.brand : COLORS.brandMuted }}
          >
            <Text className="text-body-lg font-extrabold text-white">알림 보내기</Text>
          </Pressable>

          {!canSend ? (
            <Text className="mt-3 text-center text-caption text-ink-muted">
              가실 수 있는 때를 두 가지 골라 주세요.
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
