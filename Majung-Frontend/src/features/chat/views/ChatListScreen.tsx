// 상담 탭 — 나눈 이야기 목록 (§6·§7.3).
//
// 담당자와 나눈 대화와 마중365에게 물어본 대화가 한 목록에 섞인다. 사용자에게는 둘 다
// "이야기한 곳"이라 나누어 보일 이유가 없고, 다만 **누구와 이야기했는지는 한눈에
// 갈려야 한다** — 사람 아이콘과 로봇 아이콘으로 구분한다.
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "@/shared/components/AppHeader";
import { Icon } from "@/shared/components/Icon";
import { TabBadge } from "@/shared/components/TabBadge";
import { COLORS } from "@/shared/theme/colors";

import type { Conversation } from "../domain/conversation";

function EmptyNote() {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Icon name="chat" size={40} color={COLORS.brandMuted} />
      <Text className="mt-4 text-center text-body-lg font-bold text-ink-sub">
        아직 나눈 이야기가 없어요
      </Text>
      <Text className="mt-2 text-center text-body text-ink-muted">
        할 일에서 담당자에게 알리거나{"\n"}마중365에게 물어보시면 여기에 쌓여요
      </Text>
    </View>
  );
}

function Row({ item, onOpen }: { item: Conversation; onOpen: (c: Conversation) => void }) {
  const staff = item.kind === "staff";
  return (
    <Pressable
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}와 나눈 이야기 열기`}
      className="flex-row items-center gap-4 border-b border-line bg-white px-5 py-4 active:opacity-90"
    >
      {/* 사람과 마중365를 아이콘으로 가른다. 제목만으로는 누구인지 읽히지 않는다 */}
      <View
        className="h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: staff ? COLORS.brandSoft : COLORS.chip }}
      >
        <Icon
          name={staff ? "person" : "bot"}
          size={26}
          color={staff ? COLORS.brand : COLORS.inkSub}
        />
      </View>

      <View className="min-w-0 flex-1">
        <Text className="text-body-lg font-bold text-ink-strong">{item.title}</Text>
        {item.preview ? (
          <Text numberOfLines={1} className="mt-1 text-body text-ink-sub">
            {item.preview}
          </Text>
        ) : (
          <Text className="mt-1 text-body text-ink-muted">
            {staff ? "방문 시간과 오시는 길을 여기서 정해요" : "물어보신 것을 이어서 볼 수 있어요"}
          </Text>
        )}
      </View>

      {/* 안 읽은 것이 없으면 아무것도 그리지 않는다 */}
      <View>
        <TabBadge count={item.unread} />
      </View>
    </Pressable>
  );
}

export function ChatListScreen({
  conversations,
  onOpen,
}: {
  conversations: readonly Conversation[];
  onOpen: (c: Conversation) => void;
}) {
  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top"]}>
      <AppHeader />
      <View className="border-b border-line bg-white px-5 pb-4">
        <Text className="text-heading font-extrabold text-ink-strong">나눈 이야기</Text>
      </View>

      {conversations.length === 0 ? (
        <EmptyNote />
      ) : (
        <ScrollView className="flex-1">
          {conversations.map((c) => (
            <Row key={`${c.kind}:${c.id}`} item={c} onOpen={onOpen} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
