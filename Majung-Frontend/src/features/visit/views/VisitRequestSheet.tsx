// 담당자 방문 알림 폼 (§7.2).
//
// 미리 알려두면 방문했을 때 설명할 필요 없이 바로 도와줄 수 있다. 창구에서 신분이 드러나는
// 순간이 실질적 장벽이라는 인터뷰 결과의 해법이 이것이다.
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NoteBox } from "@/shared/components/NoteBox";
import { COLORS } from "@/shared/theme/colors";

import type { IntakeAnswers } from "@/features/intake/domain/questionTypes";
import { SECTIONS, type SectionId } from "@/features/intake/domain/sections";

import { sharedItems } from "../domain/request";
import {
  answeredSections,
  buildSharedAnswers,
  droppedSharedAnswers,
  defaultSections,
  type SharedAnswer,
} from "../domain/sharedAnswers";
import { isComplete, toIso, type VisitTime } from "../domain/visitTime";
import { VisitTimeField } from "./VisitTimeField";
import { FramedModal } from "@/shared/components/FramedModal";
import { Icon } from "@/shared/components/Icon";

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
    /** 가고 싶은 시각(ISO). 화면이 골라 만든 값을 그대로 넘긴다. */
    firstChoice: string;
    readyDocs: readonly string[];
    note?: string;
    /** 함께 보내기로 한 진단 답변. 동의하지 않으면 비어 있다 (§7.4-1). */
    sharedAnswers?: readonly SharedAnswer[];
  }) => void;
  onClose: () => void;
  /** 초기 진단 답변. 없으면 함께 보내기 자리를 만들지 않는다. */
  answers?: IntakeAnswers;
  /** 무슨 일로 가는지의 지원 항목 코드. 어느 분야를 기본으로 켤지 정한다. */
  routeId?: string;
  /** 서버로 보내는 중. 두 번 눌러 두 건이 가는 것을 막는다. */
  sending?: boolean;
  /** 보내지 못했을 때의 이유. 하루 상한에 걸린 것도 여기로 온다 (§7.5). */
  error?: string | null;
};

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
  answers,
  routeId,
  sending,
  error,
}: Props) {
  const base = useMemo(() => today ?? new Date(), [today]);
  const [first, setFirst] = useState<VisitTime>({});
  const [readyDocs, setReadyDocs] = useState<string[]>([]);
  const [note, setNote] = useState("");

  // 답한 것이 있는 분야만 고를 수 있다. 답이 없는 분야를 내놓으면 고를 것이 없는 칸이 생긴다.
  const available = useMemo(() => (answers ? answeredSections(answers) : []), [answers]);
  /** 함께 보낼지. **꺼진 채로 시작한다** — 켜는 것은 사용자가 하는 결정이다. */
  const [shareOn, setShareOn] = useState(false);
  const [picked, setPicked] = useState<SectionId[]>([]);

  // 방문 목적과 같은 기관에서 처리하는 분야만 처음에 켠다 (§7.4-1).
  // 주민센터에 가는 사람에게 공단 것까지 보낼 이유가 없다.
  //
  // **처음 한 번만 정한다.** 렌더 중에 상태를 바꾸면(useMemo 안의 setState가 그렇다)
  // 사용자가 직접 켜고 끈 것이 초기값으로 되돌아간다. 어느 분야를 보낼지는
  // 사용자가 하는 결정이므로 한 번 손대면 그쪽이 이긴다.
  const suggested = useRef<string | null>(null);
  useEffect(() => {
    if (!routeId || suggested.current === routeId) return;
    suggested.current = routeId;
    setPicked(defaultSections(routeId).filter((id) => available.includes(id)));
  }, [routeId, available]);

  const shared = useMemo(
    () => (answers && shareOn ? buildSharedAnswers(answers, picked) : []),
    [answers, shareOn, picked],
  );
  // 한 번에 보낼 수 있는 줄 수가 정해져 있다. 넘치면 뒤쪽 분야의 답이 빠지는데,
  // 말없이 빠지면 사용자는 켠 것이 다 간 줄로 안다. 몇 줄이 빠지는지 그대로 알린다.
  const dropped = useMemo(
    () => (answers && shareOn ? droppedSharedAnswers(answers, picked) : 0),
    [answers, shareOn, picked],
  );

  const canSend = isComplete(first);

  const toggleDoc = (doc: string) => {
    setReadyDocs((prev) => (prev.includes(doc) ? prev.filter((d) => d !== doc) : [...prev, doc]));
  };

  const send = () => {
    const at1 = toIso(first);
    if (!at1) return;
    onSubmit({
      firstChoice: at1,
      readyDocs,
      note: note.trim() ? note.trim() : undefined,
      // 동의하지 않았으면 아예 담기지 않는다. 빈 배열도 보내지 않는다.
      sharedAnswers: shared.length > 0 ? shared : undefined,
    });
  };

  return (
    <FramedModal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
        <View className="flex-row items-center justify-between border-b border-line bg-white px-5 py-4">
          <Text className="text-heading font-extrabold text-ink-strong">방문 예약하기</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="닫기"
            className="size-10 items-center justify-center rounded-full active:opacity-70"
          >
            <Icon name="close" size={22} color={COLORS.inkMuted} />
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

          {/* **한 때만 고른다.** 1·2지망을 받던 것을 걷어냈다 — 안 되는 때를 미리
              대비하는 것은 담당자와 이야기하면 되는 일이고(§7.3), 고를 것이 두 벌이면
              그만큼 보내기까지 오래 걸린다 */}
          <SectionTitle>언제 가실 수 있나요</SectionTitle>
          <Text className="mb-3 text-caption text-ink-muted">가시고 싶은 때를 고르세요.</Text>
          <VisitTimeField value={first} onChange={setFirst} label="가고 싶은 때" today={base} />

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
                      {checked ? <Icon name="check" size={14} color={COLORS.surface} /> : null}
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

          {/* 진단 답변을 함께 보낼지 (§7.4-1).
              **창구에서 자기 사정을 입으로 말하지 않아도 되게 하는 것**이 목적이다.
              담당자 편의가 아니라 §7.6의 "창구 노출 부담을 서비스가 흡수한다"가 근거다. */}
          {available.length > 0 ? (
            <View className="mt-6">
              <Pressable
                onPress={() => setShareOn((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: shareOn }}
                accessibilityLabel="상황 알아보기에서 답한 내용도 함께 보내기"
                className="flex-row items-start gap-3 rounded-2xl border-[1.5px] px-4 py-4 active:opacity-80"
                style={{
                  backgroundColor: shareOn ? COLORS.brandSoft : COLORS.surface,
                  borderColor: shareOn ? COLORS.brand : COLORS.line,
                }}
              >
                <View
                  className="mt-0.5 size-6 items-center justify-center rounded-md border-2"
                  style={{
                    backgroundColor: shareOn ? COLORS.brand : COLORS.surface,
                    borderColor: shareOn ? COLORS.brand : COLORS.brandMuted,
                  }}
                >
                  {shareOn ? (
                    <Icon name="check" size={16} color={COLORS.surface} />
                  ) : null}
                </View>
                <View className="flex-1">
                  <Text
                    className="text-body-lg font-extrabold"
                    style={{ color: shareOn ? COLORS.brand : COLORS.inkStrong }}
                  >
                    상황 알아보기에서 답하신 내용도 함께 보낼까요?
                  </Text>
                  <Text className="mt-1 text-caption leading-[21px] text-ink-sub">
                    담당자가 미리 보면 창구에서 다시 설명하지 않으셔도 돼요.
                  </Text>
                </View>
              </Pressable>

              {shareOn ? (
                <View className="mt-3">
                  <Text className="mb-2 text-caption text-ink-sub">
                    보낼 것만 골라 주세요. 안 고른 것은 가지 않아요.
                  </Text>
                  {SECTIONS.filter((sec) => available.includes(sec.id)).map((sec) => {
                    const on = picked.includes(sec.id);
                    return (
                      <Pressable
                        key={sec.id}
                        onPress={() =>
                          setPicked((prev) =>
                            prev.includes(sec.id)
                              ? prev.filter((x) => x !== sec.id)
                              : [...prev, sec.id],
                          )
                        }
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`${sec.label} 답변 함께 보내기`}
                        className="mb-2 flex-row items-center gap-3 rounded-xl border-[1.5px] px-4 py-3 active:opacity-80"
                        style={{
                          backgroundColor: on ? COLORS.brandSoft : COLORS.surface,
                          borderColor: on ? COLORS.brand : COLORS.line,
                        }}
                      >
                        <View
                          className="size-5 items-center justify-center rounded border-2"
                          style={{
                            backgroundColor: on ? COLORS.brand : COLORS.surface,
                            borderColor: on ? COLORS.brand : COLORS.brandMuted,
                          }}
                        >
                          {on ? (
                            <Icon name="check" size={12} color={COLORS.surface} />
                          ) : null}
                        </View>
                        <Text
                          className="flex-1 text-body"
                          style={{
                            color: on ? COLORS.brand : COLORS.inkStrong,
                            fontWeight: on ? "800" : "600",
                          }}
                        >
                          {sec.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* **빠지는 답이 있으면 보내기 전에 말한다.** 켠 분야의 답이 조용히 사라지면
              사용자는 창구에서 그 이야기를 다시 해야 하는 줄 모른 채 간다 (§7.6). */}
          {dropped > 0 ? (
            <NoteBox tone="warn" className="mt-4">
              {`한 번에 보낼 수 있는 양을 넘었어요. 지금 켜신 것 중 ${dropped}줄은 담당자에게 가지 않아요. 분야를 몇 개 꺼 주시면 나머지가 모두 갑니다.`}
            </NoteBox>
          ) : null}

          {/* 무엇이 담당자에게 가는지 전송 직전에 보여준다 (§7.4). */}
          <View className="mt-6 rounded-xl border border-note-info-line bg-note-info px-4 py-4">
            <Text className="mb-2 text-body font-extrabold text-note-info-ink">
              담당자에게 이만큼만 알려줘요
            </Text>
            {sharedItems(
              note.trim().length > 0,
              Boolean(hasDeadline),
              docs.length > 0,
              // 고른 분야만 이름으로 낸다. 켜고 끈 것이 이 목록에 바로 비쳐야
              // "이만큼만 알려줘요"가 사실이 된다
              shared.length > 0 ? [...new Set(shared.map((a) => a.section))] : [],
            ).map((item) => (
              <Text key={item} className="text-caption text-note-info-ink">
                · {item}
              </Text>
            ))}
            <Text className="mt-2 text-caption text-note-info-ink">
              어떤 일로 계셨는지는 알려주지 않아요.
            </Text>
          </View>

          {/* **실패를 단추 위에 둔다.** 아래에 두면 화면 밖으로 밀려 못 보고 다시 누른다 */}
          {error ? (
            <NoteBox tone="alert" className="mt-5">
              {error}
            </NoteBox>
          ) : null}

          <Pressable
            onPress={send}
            disabled={!canSend || sending}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend || sending, busy: sending }}
            accessibilityLabel="알림 보내기"
            className="mt-5 items-center rounded-2xl py-4 active:opacity-90"
            style={{ backgroundColor: canSend && !sending ? COLORS.brand : COLORS.brandMuted }}
          >
            <Text className="text-body-lg font-extrabold text-white">
              {sending ? "보내는 중이에요" : "알림 보내기"}
            </Text>
          </Pressable>

          {!canSend ? (
            <Text className="mt-3 text-center text-caption text-ink-muted">
              가실 수 있는 때를 두 가지 골라 주세요.
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </FramedModal>
  );
}
