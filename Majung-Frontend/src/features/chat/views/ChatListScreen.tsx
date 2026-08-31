// 상담 탭 — 채팅 내역 (§6·§7.3).
//
// 담당자와 나눈 대화와 마중365에게 물어본 대화가 한 목록에 섞인다. 사용자에게는 둘 다
// "이야기한 곳"이라 나누어 보일 이유가 없고, 다만 **누구와 이야기했는지는 한눈에
// 갈려야 한다** — 사람 아이콘과 로봇 아이콘으로 구분한다.
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "@/shared/components/AppHeader";
import { Icon } from "@/shared/components/Icon";
import { ScreenTitle } from "@/shared/components/ScreenTitle";
import { COLORS } from "@/shared/theme/colors";
import { FONTS } from "@/shared/theme/fonts";
import { listWhenLabel } from "@/shared/utils/time";

import { groupByPeer, type Conversation } from "../domain/conversation";

function EmptyNote() {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Icon name="chat" size={40} color={COLORS.brandMuted} />
      <Text className="mt-4 text-center text-body-lg font-bold text-ink-sub">
        채팅 내역이 없습니다.
      </Text>
      <Text className="mt-2 text-center text-body text-ink-muted">
        궁금한 점이나 필요한 도움이 있다면{"\n"}편하게 질문해 주세요.
      </Text>
    </View>
  );
}

/**
 * 안 읽은 개수 (2026-08-31 시안).
 *
 * **하단 메뉴바의 `TabBadge`를 쓰지 못한다.** 그쪽은 아이콘 위에 겹쳐 얹는 것이라
 * `position: absolute`이고 색도 빨강이다. 여기는 줄 안에서 자리를 차지해야 하고
 * 시안이 브랜드 파랑으로 정했다.
 */
function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <View
      style={{
        minWidth: 22,
        height: 22,
        // 두 자리까지는 원이고 "99+"에서만 좌우로 늘어난다. 시안이 정한 모양이다.
        paddingHorizontal: 6,
        borderRadius: 11,
        backgroundColor: COLORS.brand,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: COLORS.surface, fontSize: 14, fontFamily: FONTS.medium }}>{label}</Text>
    </View>
  );
}

function Row({ item, onOpen }: { item: Conversation; onOpen: (c: Conversation) => void }) {
  const staff = item.kind === "staff";
  const when = listWhenLabel(item.at);
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
        <Text className="text-heading font-bold text-ink-strong">{item.title}</Text>
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

      {/* 시각이 위, 안 읽은 개수가 아래다. 둘 다 없을 수 있으므로 자리를 미리 잡지 않는다 */}
      <View className="items-end justify-center gap-3">
        {when ? <Text className="text-ink-faint" style={{ fontSize: 14, fontFamily: FONTS.medium }}>{when}</Text> : null}
        <UnreadBadge count={item.unread} />
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
      <ScreenTitle label="채팅 내역" />

      {conversations.length === 0 ? (
        <EmptyNote />
      ) : (
        <ScrollView className="flex-1">
          {/* **누구와 나눈 이야기인지로 묶는다.** 아이콘만으로는 한 목록에 섞여 있어,
              지금 보는 줄이 담당자인지 마중365인지 제목을 읽어야 알 수 있었다.
              **시안에는 이 묶음 머리가 없다.** 다만 시안의 두 줄이 모두 마중365와 나눈
              것이라 묶음이 하나뿐인 모형이고, 묶는 것 자체는 2026-08-26 결정 H-3이다.
              시안 한 장으로 그 결정을 뒤집지 않고 그대로 둔다 */}
          {groupByPeer(conversations).map((group) => (
            <View key={group.title}>
              <View className="bg-page px-5 py-2">
                <Text className="text-caption font-bold text-ink-muted">{group.title}</Text>
              </View>
              {group.items.map((c) => (
                <Row key={`${c.kind}:${c.id}`} item={c} onOpen={onOpen} />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
