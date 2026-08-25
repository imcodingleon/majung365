// 담당자 채팅 (§7.3·§8.1).
//
// 연결은 `useVisitChat`이 맡는다. 이 화면은 받은 것을 그리기만 한다.
//
// **이미지는 주고받지 않는다.** 신분증이나 서류 사진이 오가면 위험만 커진다. 텍스트만이다.
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NoteBox } from "@/shared/components/NoteBox";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { COLORS } from "@/shared/theme/colors";

export type StaffMessage = {
  id: string;
  /** 보낸 쪽. 서버가 주는 값 그대로다 — 담당자는 `staff`, 출소자는 `user`다. */
  from: "staff" | "user";
  text: string;
};

type Props = {
  /** 상대 이름. 방은 방문 요청 단위로 열린다. */
  peerName: string;
  /**
   * 이 화면을 보고 있는 쪽. **말풍선을 어느 쪽에 붙일지 정한다.**
   *
   * 담당자용으로 먼저 만들어져 "내 것"이 `staff`로 굳어 있었다. 그대로 두고 사용자
   * 쪽에서 쓰면 **자기가 보낸 말이 왼쪽에, 담당자 말이 오른쪽에 붙어 뒤집힌다.**
   */
  myRole: "staff" | "user";
  /** 제목 위 작은 글씨. 담당자는 "방문 조율", 사용자는 "담당자와 이야기하기"다. */
  eyebrow?: string;
  /** 닫기 버튼이 어디로 돌아가는지 알려주는 문구. */
  closeHint?: string;
  messages: readonly StaffMessage[];
  onSend: (text: string) => void;
  onBack: () => void;
  /**
   * 방이 열리지 않은 이유. 서버가 준 문구를 그대로 낸다.
   *
   * **없는 요청과 남의 요청에 같은 문구가 온다.** 구분해 주면 남의 방 id를 찾는 데
   * 쓰이므로 화면에서도 그 둘을 다르게 표시하지 않는다.
   */
  blocked?: string | null;
  /** 붙어 있는지. 끊긴 채 입력만 받으면 보낸 줄 알고 기다리게 된다. */
  connected?: boolean;
};

export function StaffChatScreen({
  peerName,
  myRole,
  eyebrow = "방문 조율",
  closeHint = "요청 상세로 돌아가기",
  messages,
  onSend,
  onBack,
  blocked,
  connected = true,
}: Props) {
  const [draft, setDraft] = useState("");

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    onSend(text);
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
      <ScreenHeader
        title={peerName}
        eyebrow={eyebrow}
        leading="back"
        closeHint={closeHint}
        onClose={onBack}
      />

      {/* 방이 안 열렸거나 끊긴 것을 화면이 숨기지 않는다. 담당자가 보냈다고 믿고
          기다리면 그 사이에 사용자는 답을 못 받는다 */}
      {blocked ? (
        <NoteBox tone="warn" className="mx-4 mt-3">
          {blocked}
        </NoteBox>
      ) : !connected ? (
        <View className="border-b border-line px-4 py-2" style={{ backgroundColor: COLORS.noteWarn }}>
          <Text className="text-caption font-bold" style={{ color: COLORS.noteWarnInk }}>
            연결이 끊겼어요. 다시 잇는 중이에요.
          </Text>
        </View>
      ) : null}

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
            // **보고 있는 쪽이 오른쪽이다.** 여기가 `staff`로 굳어 있으면 사용자
            // 화면에서 말풍선이 통째로 뒤집힌다.
            const mine = m.from === myRole;
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
