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

import { COLORS } from "@/shared/theme/colors";

import type { ChatMessage } from "../domain/chatMessage";

import { EvidenceBadge } from "./EvidenceBadge";

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

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <View className="mb-2.5 max-w-[82%] self-end rounded-2xl rounded-br-sm bg-brand px-3.5 py-2.5">
        <Text className="text-[15px] leading-[24px] text-white">{message.text}</Text>
      </View>
    );
  }

  if (message.role === "search-notice") {
    // 사전 고지는 답변이 아니다. 말풍선과 다른 모양으로 두어 정보로 읽히지 않게 한다.
    return (
      <View className="mb-2.5 self-stretch rounded-xl border border-note-warn-line bg-note-warn px-3.5 py-3">
        <Text className="text-sm font-semibold leading-[23px] text-note-warn-ink">{message.text}</Text>
      </View>
    );
  }

  return (
    <View className="mb-2.5 max-w-[86%] self-start rounded-2xl rounded-bl-sm bg-bubble px-3.5 py-2.5">
      <Text className="text-[15px] leading-[25px] text-ink-strong">{message.text}</Text>

      {message.desk ? (
        <View className="mt-2.5 rounded-lg border border-note-info-line bg-note-info px-3 py-2.5">
          <Text className="text-sm font-bold leading-[23px] text-note-info-ink">
            {message.desk.place}에 가서 “{message.desk.say}”라고 말하면 돼요.
          </Text>
        </View>
      ) : null}

      {message.evidence ? <EvidenceBadge evidence={message.evidence} /> : null}

      {message.contact ? (
        <View className="mt-2 border-t border-line-strong pt-2">
          <Text className="text-[13px] leading-[22px] text-ink-sub">
            더 정확한 내용은 {message.contact.org} {message.contact.phone}으로 물어보시는 게 좋아요.
          </Text>
          {message.contact.hours ? (
            <Text className="text-[13px] leading-[22px] text-ink-sub">
              전화받는 시간은 {message.contact.hours}예요.
            </Text>
          ) : null}
        </View>
      ) : null}
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
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      // 안드로이드 뒤로 가기도 닫기와 같게 둔다. 경고 없이 바로 닫힌다 (§6.3).
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
        <View className="flex-row items-center gap-2 border-b border-line px-4 py-3">
          <View className="flex-1">
            <Text className="text-[13px] text-ink-muted">이 일에 대한 대화</Text>
            <Text className="mt-0.5 text-[17px] font-extrabold text-ink-strong" numberOfLines={1}>
              {taskTitle}
            </Text>
          </View>
          <Pressable
            onPress={() => setMenuOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="더보기"
            className="size-10 items-center justify-center rounded-full active:opacity-70"
          >
            <Text className="text-xl text-ink-muted">⋯</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="대화 닫기"
            className="size-10 items-center justify-center rounded-full active:opacity-70"
          >
            <Text className="text-2xl text-ink-muted">✕</Text>
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
              <Text className="text-[15px] font-semibold text-alert">이 대화 지우기</Text>
            </Pressable>
          </View>
        ) : null}

        {confirmClear ? (
          <View className="mx-4 mt-3 rounded-xl border border-alert-line bg-alert-soft px-4 py-3.5">
            <Text className="text-[15px] font-semibold leading-[24px] text-alert-ink">
              이 대화를 지우면 다시 볼 수 없어요.
            </Text>
            <View className="mt-3 flex-row gap-2">
              <Pressable
                onPress={() => {
                  setConfirmClear(false);
                  onClear();
                }}
                accessibilityRole="button"
                className="rounded-lg bg-alert px-4 py-2.5 active:opacity-90"
              >
                <Text className="text-[15px] font-extrabold text-white">지울게요</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmClear(false)}
                accessibilityRole="button"
                className="rounded-lg border border-line bg-white px-4 py-2.5 active:opacity-90"
              >
                <Text className="text-[15px] font-semibold text-ink-sub">그냥 둘게요</Text>
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
                <Text className="text-center text-[15px] leading-[26px] text-ink-muted">
                  {taskTitle}에 대해 궁금한 것을 물어보세요.{"\n"}
                  편하게 적으셔도 괜찮아요.
                </Text>
              </View>
            ) : null}

            {messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
            {busy ? (
              <View className="mb-2.5 self-start rounded-2xl bg-bubble px-3.5 py-2.5">
                <Text className="text-[15px] text-ink-muted">답을 찾고 있어요…</Text>
              </View>
            ) : null}
          </ScrollView>

          {limitReached ? (
            // 막지 않는다. 오늘은 여기까지라고 끝내면 가장 답답한 사람을 문 앞에서 돌려보내는 셈이다.
            <View className="border-t border-line bg-note-warn px-4 py-4">
              <Text className="text-[15px] font-semibold leading-[25px] text-note-warn-ink">
                오늘 이 일로 이야기를 많이 나누셨어요.{"\n"}
                사람에게 직접 물어보는 편이 더 빠를 수 있어요.
              </Text>
              <Pressable
                onPress={onOpenHelp}
                accessibilityRole="button"
                className="mt-3 items-center rounded-xl bg-brand px-4 py-3.5 active:opacity-90"
              >
                <Text className="text-base font-extrabold text-white">전화로 물어보기</Text>
              </Pressable>
            </View>
          ) : (
            <View className="flex-row items-end gap-2 border-t border-line px-3 py-2.5">
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="궁금한 것을 물어보세요"
                placeholderTextColor={COLORS.inkMuted}
                multiline
                accessibilityLabel="질문 입력"
                className="max-h-28 flex-1 rounded-xl border-[1.5px] border-line px-3.5 py-3 text-[15px] leading-[22px] text-ink-strong"
              />
              <Pressable
                onPress={send}
                disabled={!draft.trim() || busy}
                accessibilityRole="button"
                accessibilityLabel="보내기"
                className="rounded-xl px-4 py-3.5 active:opacity-90"
                style={{ backgroundColor: !draft.trim() || busy ? COLORS.brandMuted : COLORS.brand }}
              >
                <Text className="text-base font-extrabold text-white">보내기</Text>
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
