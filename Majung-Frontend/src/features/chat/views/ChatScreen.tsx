// 챗봇 화면 조립 (CAP-1/2/3). Figma 2:1790. 데모 메인 진입 화면.
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useIsDesktop } from "@/shared/hooks/useIsDesktop";
import { useRoadmap } from "@/shared/state/roadmap";
import type { CardData } from "@/shared/types";

import { useChat } from "../hooks/useChat";
import { ChatInputArea } from "./ChatInputArea";
import { MessageItem } from "./MessageViews";
import { ScenarioPanel } from "./ScenarioPanel";

function ChatHeader() {
  return (
    <View className="flex-row items-center justify-between border-b border-line bg-white px-5 py-4 lg:hidden">
      <Text className="text-2xl text-ink-header">✕</Text>
      <Text className="text-xl text-ink-header">AI 챗봇</Text>
    </View>
  );
}

function TypingIndicator() {
  return (
    <View className="w-full flex-row items-start gap-3">
      <View className="size-10 items-center justify-center rounded-full bg-brand shadow">
        <Text className="text-lg">🤖</Text>
      </View>
      <View className="rounded-2xl rounded-tl-none bg-white px-4 py-4 shadow">
        <Text className="text-base text-ink-muted">답변을 준비하고 있어요…</Text>
      </View>
    </View>
  );
}

export function ChatScreen() {
  const { messages, streaming, error, send } = useChat();
  const { addFromCard } = useRoadmap();
  const isDesktop = useIsDesktop();
  const scrollRef = useRef<ScrollView>(null);

  // 홈 서비스 타일 진입 — params.q를 자동 전송. 탭은 리마운트되지 않으므로
  // q '값 변화'를 기준으로(불리언 아님) 다른 타일마다 새 질문이 전송되게 한다.
  const { q } = useLocalSearchParams<{ q?: string }>();
  const lastSentQRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (q && q !== lastSentQRef.current) {
      lastSentQRef.current = q;
      send(q);
    }
  }, [q, send]);

  // CAP-3→CAP-4 seam: 제도 카드를 로드맵 '오늘의 할일'에 추가.
  const onAddToRoadmap = useCallback((card: CardData) => addFromCard(card), [addFromCard]);

  const last = messages[messages.length - 1];
  const waitingFirstReply = streaming && last?.author === "user";

  return (
    <SafeAreaView className="flex-1 overflow-hidden bg-page" edges={["top"]}>
      <ChatHeader />
      {/* 데스크톱: 좌측 시나리오 패널 + 챗 컬럼 (majung365_ai.html 시안). 모바일: 패널 null. */}
      <View className="flex-1 flex-row">
        {isDesktop ? <ScenarioPanel onPick={send} disabled={streaming} /> : null}
        <View className="flex-1">
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerClassName="gap-6 px-4 pb-6 pt-4"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((m) => (
              <MessageItem key={m.id} message={m} onAddToRoadmap={onAddToRoadmap} />
            ))}
            {waitingFirstReply ? <TypingIndicator /> : null}
            {error ? (
              <View className="rounded-xl bg-[#fff3e0] px-4 py-3">
                <Text className="text-[14px] leading-5 text-[#9a5b00]">{error}</Text>
              </View>
            ) : null}
          </ScrollView>
          <ChatInputArea onSend={send} disabled={streaming} />
        </View>
      </View>
    </SafeAreaView>
  );
}
