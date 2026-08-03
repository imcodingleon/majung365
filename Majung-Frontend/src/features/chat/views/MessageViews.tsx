// 대화 항목 렌더링(뷰 전용). 비즈니스 로직 없음 — props-driven.
import { Image } from "expo-image";
import { Linking, Pressable, Text, View } from "react-native";

import type { AreaOut, CardData } from "@/shared/types";

import type { ChatMessage } from "../domain/message";

// Figma 원본 AI 아바타(남색 원 + 흰 로봇). 풀컬러 이미지라 tint 없이 그대로.
const AI_AVATAR = require("../../../../assets/images/chat/ai-avatar.png");

function BotAvatar() {
  return <Image source={AI_AVATAR} style={{ width: 40, height: 40 }} contentFit="contain" />;
}

function Timestamp({ at, align }: { at: string; align: "left" | "right" }) {
  return (
    <Text className={`text-[11px] tracking-[0.5px] text-ink-faint ${align === "right" ? "px-1 text-right" : ""}`}>
      {at}
    </Text>
  );
}

function BotTextBubble({ text, at }: { text: string; at: string }) {
  return (
    <View className="w-full flex-row items-start gap-3">
      <BotAvatar />
      <View className="max-w-[262px] flex-shrink gap-1.5 lg:max-w-[68%]">
        <View className="rounded-2xl rounded-tl-none bg-white px-4 py-4 shadow">
          <Text className="text-base leading-6 text-ink">{text}</Text>
        </View>
        <Timestamp at={at} align="left" />
      </View>
    </View>
  );
}

function UserTextBubble({ text, at }: { text: string; at: string }) {
  return (
    <View className="w-full items-end gap-2">
      <View className="max-w-[304px] rounded-2xl rounded-tr-none bg-brand px-4 py-4 shadow lg:max-w-[68%]">
        <Text className="text-base font-medium leading-6 text-white">{text}</Text>
      </View>
      <Timestamp at={at} align="right" />
    </View>
  );
}

/** triage 결과 — "지금 가장 급한 일" (design-map: triage는 챗봇+로드맵으로 표현, 1:221 화면 미사용). */
function TriageBanner({ areas, at }: { areas: AreaOut[]; at: string }) {
  const ranked = [...areas].sort((a, b) => a.rank - b.rank);
  return (
    <View className="w-full flex-row items-start gap-3">
      <BotAvatar />
      <View className="max-w-[262px] flex-shrink gap-1.5 lg:max-w-[68%]">
        <View className="gap-3 rounded-2xl rounded-tl-none border border-line bg-white px-4 py-4 shadow">
          <Text className="text-base font-bold text-brand">지금 가장 급한 일이에요</Text>
          {ranked.map((area) => (
            <View key={area.key} className="flex-row items-start gap-2">
              <View className="mt-0.5 size-5 items-center justify-center rounded-full bg-brand-soft">
                <Text className="text-xs font-bold text-brand">{area.rank}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-ink">{area.label}</Text>
                <Text className="text-[13px] leading-5 text-ink-muted">{area.reason}</Text>
              </View>
            </View>
          ))}
        </View>
        <Timestamp at={at} align="left" />
      </View>
    </View>
  );
}

function CardRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-2">
      <Text className="text-[13px] font-bold text-ink">{label}</Text>
      <Text className="flex-1 text-[14px] leading-[22px] text-ink">{value}</Text>
    </View>
  );
}

/** 제도 안내 카드(CAP-3). KB 매칭 결과 — 제도명·어디서·서류·다음 단계 + 기한 경고. */
function SupportCard({ card }: { card: CardData }) {
  return (
    <View className="w-full flex-row items-start gap-3">
      <BotAvatar />
      <View className="w-[262px] overflow-hidden rounded-xl border border-line bg-white shadow lg:w-[380px]">
        {/* 제목 */}
        <View className="flex-row items-center justify-between border-b border-line px-4 py-4">
          <Text className="flex-1 text-base font-bold text-brand">{card.name}</Text>
          <Text className="text-base text-ink-faint">ⓘ</Text>
        </View>

        {/* 본문 */}
        <View className="gap-2 px-4 py-4">
          <Text className="text-[14px] leading-[22px] text-ink">{card.summary_easy}</Text>
          <CardRow label="어디서" value={card.where} />
          {card.docs.length > 0 && <CardRow label="필요 서류" value={card.docs.join(", ")} />}
          <CardRow label="다음 단계" value={card.next_step} />
          {card.deadline ? (
            <View className="mt-1 rounded-lg bg-[#fff3e0] px-3 py-2">
              <Text className="text-[13px] font-bold text-[#9a5b00]">⏰ {card.deadline}</Text>
            </View>
          ) : null}
        </View>

        {/* CTA: 바로가기 */}
        <Pressable
          className="items-center border-t border-line bg-brand-soft py-3 active:opacity-80"
          onPress={() => card.source_url && Linking.openURL(card.source_url)}
        >
          <Text className="text-[14px] font-semibold text-brand">바로가기</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function MessageItem({ message }: { message: ChatMessage }) {
  switch (message.kind) {
    case "text":
      return message.author === "user" ? (
        <UserTextBubble text={message.text} at={message.at} />
      ) : (
        <BotTextBubble text={message.text} at={message.at} />
      );
    case "triage":
      return <TriageBanner areas={message.areas} at={message.at} />;
    case "card":
      return <SupportCard card={message.card} />;
    default:
      return null;
  }
}
