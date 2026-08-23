// 담당자 채팅 (§7.3·§8.1).
//
// **화면만이다.** 백엔드 Socket.IO가 아직 없다. 붙일 때 지켜야 할 것이 정해져 있다.
//   - 접속 핸드셰이크에 세션 토큰을 실어 서버가 검증한다. 방 참여자가 아니면 입장 거부
//   - 낙관적 UI. 임시 말풍선을 먼저 그리고 clientMsgId로 서버 에코와 짝짓는다
//   - 전송 방식을 websocket으로 고정하지 않는다. polling으로 붙은 뒤 승격한다
//   - 토큰이 갱신되면 소켓 자격증명도 교체한다
//
// **이미지는 주고받지 않는다.** 신분증이나 서류 사진이 오가면 위험만 커진다. 텍스트만이다.
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "@/shared/theme/colors";

export type StaffMessage = {
  id: string;
  /** 담당자가 보냈으면 staff, 출소자가 보냈으면 client. */
  from: "staff" | "client";
  text: string;
};

type Props = {
  /** 상대 이름. 방은 방문 요청 단위로 열린다. */
  peerName: string;
  messages: readonly StaffMessage[];
  onSend: (text: string) => void;
  onBack: () => void;
};

export function StaffChatScreen({ peerName, messages, onSend, onBack }: Props) {
  const [draft, setDraft] = useState("");

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    onSend(text);
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
      <View className="flex-row items-center gap-3 border-b border-line px-4 py-3">
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="뒤로"
          className="size-10 items-center justify-center rounded-full active:opacity-70"
        >
          <Text className="text-2xl text-ink-muted">‹</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-caption text-ink-muted">방문 조율</Text>
          <Text className="mt-1 text-body-lg font-extrabold text-ink-strong">{peerName}</Text>
        </View>
      </View>

      <View className="border-b border-line bg-alert-soft px-4 py-2">
        <Text className="text-caption font-bold text-alert">
          시연용 화면 · 아직 실제로 전송되지 않습니다
        </Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView className="flex-1" contentContainerClassName="px-4 py-4">
          {messages.length === 0 ? (
            <Text className="mt-10 text-center text-body text-ink-muted">
              여기서 방문 시간과 오시는 길을 조율합니다.
            </Text>
          ) : null}

          {messages.map((m) => {
            const mine = m.from === "staff";
            return (
              <View
                key={m.id}
                className="mb-3 max-w-[82%] rounded-2xl px-4 py-3"
                style={{
                  alignSelf: mine ? "flex-end" : "flex-start",
                  backgroundColor: mine ? COLORS.brand : COLORS.bubble,
                  borderBottomRightRadius: mine ? 4 : 16,
                  borderBottomLeftRadius: mine ? 16 : 4,
                }}
              >
                <Text
                  className="text-body"
                  style={{ color: mine ? COLORS.surface : COLORS.inkStrong }}
                >
                  {m.text}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        <View className="flex-row items-end gap-2 border-t border-line px-3 py-3">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholder="메시지를 적으세요"
            placeholderTextColor={COLORS.inkMuted}
            accessibilityLabel="메시지 입력"
            className="max-h-28 flex-1 rounded-xl border-[1.5px] border-line px-4 py-3 text-body text-ink-strong"
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim()}
            accessibilityRole="button"
            accessibilityLabel="보내기"
            className="rounded-xl px-4 py-4 active:opacity-90"
            style={{ backgroundColor: draft.trim() ? COLORS.brand : COLORS.brandMuted }}
          >
            <Text className="text-body-lg font-extrabold text-white">보내기</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
