// 담당자 방문 알림 폼 (§7.2).
//
// 미리 알려두면 방문했을 때 설명할 필요 없이 바로 도와줄 수 있다. 창구에서 신분이 드러나는
// 순간이 실질적 장벽이라는 인터뷰 결과의 해법이 이것이다.
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NoteBox } from "@/shared/components/NoteBox";
import { COLORS } from "@/shared/theme/colors";
import { FONTS } from "@/shared/theme/fonts";

import type { IntakeAnswers } from "@/features/intake/domain/questionTypes";
import { SECTIONS, type SectionId } from "@/features/intake/domain/sections";

import {
  answeredSections,
  buildSharedAnswers,
  droppedSharedAnswers,
  defaultSections,
  type SharedAnswer,
} from "../domain/sharedAnswers";
import { VisitTimeField } from "@/shared/components/VisitTimeField";
import { isComplete, toIso, type VisitTime } from "@/shared/utils/visitTime";
import { FramedModal } from "@/shared/components/FramedModal";
import { Icon } from "@/shared/components/Icon";
import { InfoPanel } from "@/shared/components/InfoPanel";

type Props = {
  visible: boolean;
  /** 인사말과 같은 이름. 매번 손으로 입력하게 하면 부담이 커진다 (§2.5-2). */
  userName: string;
  /** 무슨 일로 가는지. 할 일 이름이 그대로 들어온다. */
  purpose: string;
  /** 이 할 일의 준비물 목록. 담당자가 미리 알면 헛걸음을 막는다. */
  docs: readonly string[];
  /**
   * 기한이 있는 제도를 상담하는 자리인지. 그때만 출소날짜를 함께 보낸다 (§7.4).
   *
   * **지금 화면은 이 값을 쓰지 않는다.** 전송 항목 목록("담당자에게 이만큼만 알려줘요")이
   * 이 값으로 "출소한 날짜" 줄을 넣을지 정했는데, 2026-08-31 시안이 그 목록을 안심
   * 문장으로 바꿨다. 무엇을 보낼지는 서버가 정하므로 계약은 그대로 둔다.
   */
  hasDeadline?: boolean;
  /** 시간 후보를 만들 기준 날짜. 넘기지 않으면 오늘로 잡는다. */
  today?: Date;
  onSubmit: (payload: {
    /** 가고 싶은 시각(ISO). 화면이 골라 만든 값을 그대로 넘긴다. */
    wantedAt: string;
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

/** 구역 제목. 뒤에 "(선택)"이 붙는 자리가 있어 자식으로 받는다 (2026-08-31 시안). */
function SectionTitle({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <View className="mb-3 mt-6 flex-row items-center gap-1">
      <Text
        className="font-semibold text-ink-strong"
        style={{ fontSize: 16, lineHeight: 27 }}
      >
        {children}
      </Text>
      {/* 안 적어도 된다는 것을 제목에서 알린다. 아래 보조 문구까지 읽어야 알 수 있으면
          적어야 하는 줄 알고 멈추는 사람이 생긴다 */}
      {optional ? (
        <Text
          className="text-ink-muted"
          style={{ fontSize: 14, lineHeight: 21, fontFamily: FONTS.medium }}
        >
          (선택)
        </Text>
      ) : null}
    </View>
  );
}

/** 제목 아래 한 줄 안내. */
function SectionHint({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="mb-3 text-ink-muted"
      style={{ fontSize: 14, lineHeight: 21, fontFamily: FONTS.medium }}
    >
      {children}
    </Text>
  );
}

/**
 * 고칠 수 없는 값을 보여주는 자리 (이름·방문 목적).
 *
 * **테두리를 두르지 않는다** (시안). 테두리가 있으면 입력칸으로 보여서 눌러 고치려
 * 하게 된다. 회색 바탕만으로 "여기는 이미 정해진 값"이 읽힌다.
 */
function ValueBox({ children }: { children: React.ReactNode }) {
  return (
    <View
      className="justify-center rounded-xl px-4"
      style={{ backgroundColor: COLORS.line, height: 62 }}
    >
      <Text
        className="text-ink-strong"
        style={{ fontSize: 20, fontFamily: FONTS.medium }}
      >
        {children}
      </Text>
    </View>
  );
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
  /**
   * 함께 보낼 분야.
   *
   * **이 목록이 곧 동의다** (2026-08-31 시안). 전에는 "함께 보낼까요?" 스위치를 따로
   * 두었는데, 켜 놓고 분야를 하나도 안 고르면 아무것도 안 가면서 켜진 것처럼 보였다.
   * 하나도 안 고르면 답변도 동의 기록도 서버로 가지 않는다 (§7.4-1).
   */
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
    () => (answers && picked.length > 0 ? buildSharedAnswers(answers, picked) : []),
    [answers, picked],
  );
  // 한 번에 보낼 수 있는 줄 수가 정해져 있다. 넘치면 뒤쪽 분야의 답이 빠지는데,
  // 말없이 빠지면 사용자는 켠 것이 다 간 줄로 안다. 몇 줄이 빠지는지 그대로 알린다.
  const dropped = useMemo(
    () => (answers && picked.length > 0 ? droppedSharedAnswers(answers, picked) : 0),
    [answers, picked],
  );

  const canSend = isComplete(first);

  const toggleDoc = (doc: string) => {
    setReadyDocs((prev) => (prev.includes(doc) ? prev.filter((d) => d !== doc) : [...prev, doc]));
  };

  const send = () => {
    const at1 = toIso(first);
    if (!at1) return;
    onSubmit({
      wantedAt: at1,
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
        {/* **나가는 길이 왼쪽이다** (시안). 오른쪽 위는 엄지가 닿기 먼 자리라, 거기에
            두면 저리터러시 사용자가 긴 폼 안에 갇힌 느낌을 받는다 */}
        <View className="h-16 flex-row items-center justify-between border-b border-line bg-white px-5">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="닫기"
            className="size-10 items-center justify-center rounded-full active:opacity-70"
          >
            <Icon name="close" size={22} color={COLORS.inkMuted} />
          </Pressable>
          <Text
            className="text-ink-strong"
            style={{ fontSize: 20, lineHeight: 28, fontFamily: FONTS.bold }}
            accessibilityRole="header"
          >
            방문 예약하기
          </Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-10 pt-5"
          keyboardShouldPersistTaps="handled"
        >
          <InfoPanel icon="info">
            {"정확한 안내를 위해 몇 가지만 여쭤볼게요.\n알려주신 내용은 상담을 위해서만 사용돼요."}
          </InfoPanel>

          <SectionTitle>상담자 성함</SectionTitle>
          <ValueBox>{userName}</ValueBox>

          <SectionTitle>방문 목적</SectionTitle>
          <ValueBox>{purpose}</ValueBox>

          {/* **한 때만 고른다.** 1·2지망을 받던 것을 걷어냈다 — 안 되는 때를 미리
              대비하는 것은 담당자와 이야기하면 되는 일이고(§7.3), 고를 것이 두 벌이면
              그만큼 보내기까지 오래 걸린다 */}
          <SectionTitle>방문 가능한 날짜와 시간</SectionTitle>
          <SectionHint>가능한 시간을 선택해 주세요.</SectionHint>
          <VisitTimeField value={first} onChange={setFirst} label="가고 싶은 때" today={base} />

          {docs.length > 0 ? (
            <>
              <SectionTitle>준비하실 자료</SectionTitle>
              <SectionHint>가지고 계신 것에 표시해 주세요. 없어도 괜찮아요.</SectionHint>
              {docs.map((doc) => {
                const checked = readyDocs.includes(doc);
                return (
                  <Pressable
                    key={doc}
                    onPress={() => toggleDoc(doc)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={doc}
                    className="mb-2 flex-row items-center gap-3 rounded-2xl border-[1.5px] p-4 active:opacity-80"
                    style={{
                      // 고른 것은 `tint`다. `soft`는 진해서 글자를 밀어낸다 (시안).
                      backgroundColor: checked ? COLORS.brandTint : COLORS.surface,
                      borderColor: checked ? COLORS.brand : COLORS.line,
                    }}
                  >
                    {/* **네모를 유지한다.** 시안은 동그라미로 그렸지만 이 자리는 여러 개를
                        고를 수 있는 곳이고, 동그라미는 하나만 고르라는 표시로 읽힌다 */}
                    <View
                      className="size-6 items-center justify-center rounded-md border-2"
                      style={{
                        backgroundColor: checked ? COLORS.brand : COLORS.surface,
                        borderColor: checked ? COLORS.brand : COLORS.lineStrong,
                      }}
                    >
                      {checked ? <Icon name="check" size={14} color={COLORS.surface} /> : null}
                    </View>
                    <Text
                      className="flex-1 font-semibold text-ink-strong"
                      style={{ fontSize: 18, lineHeight: 28 }}
                    >
                      {doc}
                    </Text>
                  </Pressable>
                );
              })}
            </>
          ) : null}

          <SectionTitle optional>추가로 알려주실 내용</SectionTitle>
          <SectionHint>담당자가 미리 확인하고 더 빠르게 안내해 드릴 수 있어요.</SectionHint>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="알려주고 싶은 내용을 자유롭게 적어 주세요."
            placeholderTextColor={COLORS.inkMuted}
            accessibilityLabel="추가로 알려주실 내용"
            className="rounded-2xl border-[1.5px] border-line bg-white p-4"
            style={{ minHeight: 96, fontSize: 16, lineHeight: 27, color: COLORS.inkStrong }}
            textAlignVertical="top"
          />

          {/* 진단 답변을 함께 보낼지 (§7.4-1).
              **창구에서 자기 사정을 입으로 말하지 않아도 되게 하는 것**이 목적이다.
              담당자 편의가 아니라 §7.6의 "창구 노출 부담을 서비스가 흡수한다"가 근거다. */}
          {available.length > 0 ? (
            <View>
              {/* **켜고 끄는 스위치를 따로 두지 않는다** (2026-08-31 시안). 전에는
                  "함께 보낼까요?" 체크를 켜야 분야 목록이 나왔는데, 두 번 눌러야 하는
                  데다 켜 놓고 분야를 안 고르면 아무것도 안 가는 상태가 만들어졌다.
                  **분야를 고르는 행위가 곧 함께 보내겠다는 뜻이다** — 하나도 안 고르면
                  답변도 동의 기록도 서버로 가지 않는다 (§7.4-1). */}
              <View className="mb-3 mt-6 items-center gap-1">
                <View className="flex-row items-center gap-1">
                  <Text
                    className="font-semibold text-ink-strong"
                    style={{ fontSize: 16, lineHeight: 27 }}
                  >
                    앞서 답하신 내용도 함께 보내드릴까요?
                  </Text>
                  <Text
                    className="text-ink-muted"
                    style={{ fontSize: 14, lineHeight: 21, fontFamily: FONTS.medium }}
                  >
                    (선택)
                  </Text>
                </View>
                {/* 여럿을 고를 수 있다는 것을 배지로 알린다. 네모 표시만으로는 하나만
                    고르는 자리로 읽는 사람이 있다 */}
                <View
                  className="items-center justify-center rounded-lg px-2 py-1.5"
                  style={{ backgroundColor: COLORS.brandBadge }}
                >
                  <Text
                    style={{ fontSize: 16, lineHeight: 21, fontFamily: FONTS.medium, color: COLORS.brand }}
                  >
                    복수 선택 가능
                  </Text>
                </View>
              </View>
              <SectionHint>해당되는 항목을 선택해 주세요.</SectionHint>

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
                    className="mb-2 flex-row items-center gap-3 rounded-2xl border-[1.5px] p-4 active:opacity-80"
                    style={{
                      backgroundColor: on ? COLORS.brandTint : COLORS.surface,
                      borderColor: on ? COLORS.brand : COLORS.line,
                    }}
                  >
                    <View
                      className="size-6 items-center justify-center rounded-md border-2"
                      style={{
                        backgroundColor: on ? COLORS.brand : COLORS.surface,
                        borderColor: on ? COLORS.brand : COLORS.lineStrong,
                      }}
                    >
                      {on ? <Icon name="check" size={14} color={COLORS.surface} /> : null}
                    </View>
                    <Text
                      className="flex-1 font-semibold text-ink-strong"
                      style={{ fontSize: 18, lineHeight: 28 }}
                    >
                      {sec.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* **빠지는 답이 있으면 보내기 전에 말한다.** 켠 분야의 답이 조용히 사라지면
              사용자는 창구에서 그 이야기를 다시 해야 하는 줄 모른 채 간다 (§7.6). */}
          {dropped > 0 ? (
            <NoteBox tone="warn" className="mt-4">
              {`한 번에 보낼 수 있는 양을 넘었어요. 지금 켜신 것 중 ${dropped}줄은 담당자에게 가지 않아요. 분야를 몇 개 꺼 주시면 나머지가 모두 갑니다.`}
            </NoteBox>
          ) : null}

          {/* **보내기 전에 이것이 무엇인지 못 박는다** (시안). 예약이 잡힌 줄 알고
              그날 찾아갔다가 담당자가 모르는 일이 실제 위험이다 */}
          <Text
            className="mt-4 text-center text-ink-muted"
            style={{ fontSize: 15, lineHeight: 21, fontFamily: FONTS.medium }}
          >
            예약을 확정하는 것이 아니며, 담당자가 확인 후 연락드립니다.
          </Text>

          {/* 적은 것이 밖으로 나가지 않는다는 안심 (2026-08-31 시안).
              **전에는 "담당자에게 이만큼만 알려줘요" 목록이 이 자리에 있었다.** §7.4의
              최소 노출 고지였는데, 시안이 안심 문장으로 바꿨고 사용자가 그쪽을 택했다.
              무엇이 가는지는 문장 안에 이름으로 남는다 */}
          <View className="mt-6">
            <InfoPanel title="안심하고 알려주세요" icon="lock">
              {"이름, 방문 시간, 준비하실 자료, 상담 내용 등\n어떤 정보도 다른 곳에 사용되거나 공유되지 않아요."}
            </InfoPanel>
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
            className="mt-5 items-center justify-center rounded-2xl active:opacity-90"
            style={{
              height: 59,
              backgroundColor: canSend && !sending ? COLORS.brand : COLORS.brandMuted,
            }}
          >
            <Text
              className="text-white"
              style={{ fontSize: 20, lineHeight: 27, fontFamily: FONTS.bold }}
            >
              {sending ? "보내는 중이에요" : "알림 보내기"}
            </Text>
          </Pressable>

          {!canSend ? (
            <Text className="mt-3 text-center text-caption text-ink-muted">
              가실 수 있는 때를 골라 주세요.
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </FramedModal>
  );
}
