// 하단 고정 입력 영역 — 프리셋 칩 + 입력창 + 전송. (Figma 2:2029)
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { PRESET_CHIPS } from "../domain/message";

export function ChatInputArea({
  onSend,
  disabled,
  onMic,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  /** 음성 상담(베타)으로 이동. 제공 시 마이크 버튼 노출. */
  onMic?: () => void;
}) {
  const [text, setText] = useState("");

  const submit = (): void => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
  };

  return (
    <View className="w-full gap-3 overflow-hidden border-t border-line bg-white px-4 pb-3 pt-3">
      {/* 빠른 질문 칩 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {PRESET_CHIPS.map((chip) => (
          <Pressable
            key={chip}
            className="rounded-full bg-chip px-4 py-2 active:opacity-80"
            onPress={() => onSend(chip)}
            disabled={disabled}
          >
            <Text className="text-[14px] text-chip-ink">{chip}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* 입력 바 — 입력창을 flex 컨테이너로 감싸야(min-w-0) 웹에서 정상 축소되어 전송 버튼이 밀려나지 않음 */}
      <View className="flex-row items-center gap-3">
        {onMic ? (
          <Pressable
            className="size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft active:opacity-80"
            onPress={onMic}
            accessibilityLabel="음성으로 말하기"
          >
            <Text className="text-lg">🎤</Text>
          </Pressable>
        ) : null}
        <View className="min-w-0 flex-1">
          <TextInput
            className="h-12 w-full rounded-full bg-line px-6 text-base text-ink"
            placeholder="메시지를 입력하세요..."
            placeholderTextColor="#939393"
            value={text}
            onChangeText={setText}
            onSubmitEditing={submit}
            returnKeyType="send"
            editable={!disabled}
          />
        </View>
        <Pressable
          className="size-12 shrink-0 items-center justify-center rounded-full bg-brand active:opacity-80 disabled:opacity-50"
          onPress={submit}
          disabled={disabled}
        >
          <Text className="text-lg text-white">➤</Text>
        </Pressable>
      </View>
    </View>
  );
}
