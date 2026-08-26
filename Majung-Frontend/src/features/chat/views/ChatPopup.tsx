// AI 채팅 팝업 (§6.1).
// v1은 탭 안에서 대화하는 구조였는데 정보 카드와 채팅이 좁은 영역에 겹쳐 화면이 혼잡했다.
// 화면 전체를 덮되 페이지 이동은 아니다. 닫으면 보고 있던 탭이 열린 그 상태로 돌아온다.
//
// 이 컴포넌트는 대화 데이터를 만들지 않는다. 스트리밍 연결은 상위에서 주입한다.
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NoteBox, NoteLine } from "@/shared/components/NoteBox";
import { COLORS } from "@/shared/theme/colors";
import { josa } from "@/shared/utils/korean";

import type { ChatMessage } from "../domain/chatMessage";

import { EvidenceBadge } from "./EvidenceBadge";
import { RichText } from "./RichText";
import { FramedModal } from "@/shared/components/FramedModal";
import { Icon } from "@/shared/components/Icon";

type Props = {
  visible: boolean;
  /** 어느 할 일에 대한 대화인지. 할 일마다 대화방이 따로 있다. */
  taskTitle: string;
  messages: readonly ChatMessage[];
  /** 답변을 기다리는 중이면 입력을 잠근다. */
  busy?: boolean;
  /**
   * 오늘 더 보낼 수 없는 상태 (§6.2). 막지 않고 사람에게 닿는 길로 넘긴다.
   * 한 할 일에 스무 번을 물었다면 채팅으로 풀 문제가 아닐 가능성이 높다.
   */
  limitReached?: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
  onClear: () => void;
  /** 상한에 닿았을 때 여는 도움 연결 화면 (§5.3). */
  onOpenHelp: () => void;
};

/**
 * 무엇을 물어야 할지 모르는 사람을 위한 첫 마디 (시안).
 *
 * **빈 입력창은 저리터러시 사용자에게 가장 어려운 화면이다.** 물어볼 것이 없어서가
 * 아니라 어떻게 물어야 할지 몰라서 멈춘다. 눌러서 보내면 되는 문장을 몇 개 둔다.
 */
const PRESETS = [
  "오늘 뭐 해야 해요?",
  "어디로 가면 돼요?",
  "무슨 서류가 필요해요?",
  "돈이 드나요?",
] as const;

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <View className="mb-3 max-w-[82%] self-end rounded-2xl rounded-br-sm bg-brand px-4 py-3">
        <Text className="text-body text-white">{message.text}</Text>
      </View>
    );
  }

  if (message.role === "search-notice") {
    // 사전 고지는 답변이 아니다. 말풍선과 다른 모양으로 두어 정보로 읽히지 않게 한다.
    return (
      <NoteBox tone="warn" className="mb-3 self-stretch">{message.text}</NoteBox>
    );
  }

  return (
    // 시안의 아바타. **누가 말하는지가 한눈에 보여야 한다** — 저리터러시 사용자에게
    // 좌우 정렬만으로는 사람 말과 기계 말이 구별되지 않는다.
    <View className="mb-3 max-w-[92%] flex-row items-start gap-2 self-start">
      <View
        className="mt-1 size-8 items-center justify-center rounded-full"
        style={{ backgroundColor: COLORS.brand }}
      >
        <Icon name="bot" size={20} color={COLORS.surface} />
      </View>
      <View className="flex-1 rounded-2xl rounded-tl-sm bg-bubble px-4 py-3">
      {/* 모델이 쓴 `**굵게**`와 `---`를 푼다. 그대로 두면 별표가 화면에 보인다 */}
      <RichText text={message.text} className="text-body text-ink-strong" />

      {message.desk ? (
        // 값이 섞인 문장은 NoteLine으로 감싼다. 그대로 두면 조각이 View의 자식이 되어
        // 안드로이드에서 터진다 — NoteBox는 자식이 문자열 하나일 때만 감싼다.
        <NoteBox tone="info" className="mt-3">
          <NoteLine tone="info">
            {message.desk.place}에 가서 “{message.desk.say}”라고 말하면 돼요.
          </NoteLine>
        </NoteBox>
      ) : null}

      {/* **확인한 날짜는 화면에 내지 않는다** (2026-08-26 결정). 근거를 밝히는 일은
          이 배지가 맡는다 — 날짜까지 적으면 저리터러시 사용자에게는 읽을 것만 늘고,
          "8월 23일"이 방문해야 할 날짜로 읽히기까지 한다 */}
      {message.evidence ? <EvidenceBadge evidence={message.evidence} /> : null}

      {message.contact ? (
        <View className="mt-2 border-t border-line-strong pt-2">
          <Text className="text-caption text-ink-sub">
            더 정확한 내용은 {message.contact.org} {message.contact.phone}
            {josa(message.contact.phone, "으로", "로")} 물어보시는 게 좋아요.
          </Text>
          {message.contact.hours ? (
            <Text className="text-caption text-ink-sub">
              전화받는 시간은 {message.contact.hours}예요.
            </Text>
          ) : null}
        </View>
      ) : null}
      </View>
    </View>
  );
}

export function ChatPopup({
  visible,
  taskTitle,
  messages,
  busy,
  limitReached,
  onSend,
  onClose,
  onClear,
  onOpenHelp,
}: Props) {
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // 새 메시지가 오면 맨 아래로 내린다. 안 그러면 답이 온 줄 모른다.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messages.length, visible]);

  // 팝업을 닫으면 열려 있던 메뉴도 함께 접는다.
  useEffect(() => {
    if (!visible) {
      setMenuOpen(false);
      setConfirmClear(false);
    }
  }, [visible]);

  const send = () => {
    const text = draft.trim();
    if (!text || busy || limitReached) return;
    setDraft("");
    onSend(text);
  };

  return (
    <FramedModal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      // 안드로이드 뒤로 가기도 닫기와 같게 둔다. 경고 없이 바로 닫힌다 (§6.3).
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
        {/* 시안대로 닫기를 왼쪽에 둔다. 오른쪽 위는 엄지가 닿기 먼 자리라 나가는 길을
            거기 두면 저리터러시 사용자가 갇힌 느낌을 받는다. */}
        <View className="flex-row items-center gap-2 border-b border-line px-3 py-3">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="대화 닫기"
            className="size-10 items-center justify-center rounded-full active:opacity-70"
          >
            <Icon name="close" size={22} color={COLORS.inkMuted} />
          </Pressable>

          <View className="flex-1 px-1">
            <Text className="text-caption text-ink-muted" numberOfLines={1}>
              {taskTitle}
            </Text>
          </View>

          <Text className="text-body-lg font-extrabold text-ink-strong">AI 챗봇</Text>
          <Pressable
            onPress={() => setMenuOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="더보기"
            className="size-10 items-center justify-center rounded-full active:opacity-70"
          >
            <Text className="text-xl text-ink-muted">⋯</Text>
          </Pressable>
        </View>

        {menuOpen ? (
          <View className="absolute right-4 top-[68px] z-10 rounded-xl border border-line bg-white py-1 shadow">
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                setConfirmClear(true);
              }}
              accessibilityRole="button"
              className="px-5 py-3 active:opacity-70"
            >
              <Text className="text-body font-semibold text-alert">이 대화 지우기</Text>
            </Pressable>
          </View>
        ) : null}

        {confirmClear ? (
          <View className="mx-4 mt-3 rounded-xl border border-alert-line bg-alert-soft px-4 py-4">
            <Text className="text-body font-semibold text-alert-ink">
              이 대화를 지우면 다시 볼 수 없어요.
            </Text>
            <View className="mt-3 flex-row gap-2">
              <Pressable
                onPress={() => {
                  setConfirmClear(false);
                  onClear();
                }}
                accessibilityRole="button"
                className="rounded-lg bg-alert px-4 py-3 active:opacity-90"
              >
                <Text className="text-body font-extrabold text-white">지울게요</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmClear(false)}
                accessibilityRole="button"
                className="rounded-lg border border-line bg-white px-4 py-3 active:opacity-90"
              >
                <Text className="text-body font-semibold text-ink-sub">그냥 둘게요</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerClassName="px-4 pb-4 pt-4"
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 ? (
              <View className="mt-10 px-2">
                <Text className="text-center text-body text-ink-muted">
                  {taskTitle}에 대해 궁금한 것을 물어보세요.{"\n"}
                  편하게 적으셔도 괜찮아요.
                </Text>
              </View>
            ) : null}

            {messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
            {busy ? (
              <View className="mb-3 self-start rounded-2xl bg-bubble px-4 py-3">
                <Text className="text-body text-ink-muted">답을 찾고 있어요…</Text>
              </View>
            ) : null}
          </ScrollView>

          {limitReached ? (
            // 막지 않는다. 오늘은 여기까지라고 끝내면 가장 답답한 사람을 문 앞에서 돌려보내는 셈이다.
            <View className="border-t border-line bg-note-warn px-4 py-4">
              <Text className="text-body font-semibold text-note-warn-ink">
                오늘 이 일로 이야기를 많이 나누셨어요.{"\n"}
                사람에게 직접 물어보는 편이 더 빠를 수 있어요.
              </Text>
              <Pressable
                onPress={onOpenHelp}
                accessibilityRole="button"
                className="mt-3 items-center rounded-xl bg-brand px-4 py-4 active:opacity-90"
              >
                <Text className="text-body-lg font-extrabold text-white">전화로 물어보기</Text>
              </Pressable>
            </View>
          ) : (
            <View className="border-t border-line">
              {/* 대화가 아직 없을 때만 낸다. 오간 뒤에는 화면을 좁히기만 한다 */}
              {messages.length === 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="max-h-14"
                  contentContainerClassName="gap-2 px-3 py-3"
                  keyboardShouldPersistTaps="handled"
                >
                  {PRESETS.map((preset) => (
                    <Pressable
                      key={preset}
                      onPress={() => onSend(preset)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={preset}
                      className="rounded-full px-4 py-3 active:opacity-80"
                      style={{ backgroundColor: COLORS.chip }}
                    >
                      <Text className="text-caption font-bold" style={{ color: COLORS.chipInk }}>
                        {preset}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}

              <View className="flex-row items-end gap-2 px-3 pb-3 pt-1">
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="궁금한 것을 물어보세요"
                  placeholderTextColor={COLORS.inkMuted}
                  multiline
                  accessibilityLabel="질문 입력"
                  className="max-h-28 flex-1 rounded-2xl px-4 py-3 text-body text-ink-strong"
                  style={{ backgroundColor: COLORS.bubble }}
                />
                {/* 시안의 원형 전송 버튼. 글자 대신 화살표를 쓰면 글을 읽기 어려운
                    사람도 방향으로 뜻을 안다 */}
                <Pressable
                  onPress={send}
                  disabled={!draft.trim() || busy}
                  accessibilityRole="button"
                  accessibilityLabel="보내기"
                  className="size-12 items-center justify-center rounded-full active:opacity-90"
                  style={{
                    backgroundColor: !draft.trim() || busy ? COLORS.brandMuted : COLORS.brand,
                  }}
                >
                  <Icon name="send" size={22} color={COLORS.surface} />
                </Pressable>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </FramedModal>
  );
}
