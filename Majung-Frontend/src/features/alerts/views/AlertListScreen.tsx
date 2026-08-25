// 알림 탭 — 담당자에게서 온 소식 (§7.1).
//
// 방문 요청의 상태가 바뀌면 여기에 쌓인다. **새로 저장하는 것이 없다** — 이미 서버에
// 있는 요청 데이터를 조합해서 만든다.
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "@/shared/components/AppHeader";
import { Icon, type IconName } from "@/shared/components/Icon";
import { COLORS } from "@/shared/theme/colors";

import type { Alert, AlertKind } from "../domain/alert";

/** 소식의 성격을 그림으로도 알린다. 글을 빨리 읽지 못해도 무슨 일인지 보인다. */
const ICON: Record<AlertKind, IconName> = {
  confirmed: "checkCircle",
  proposed: "undo",
  cancelled: "close",
  message: "chat",
};

const TONE: Record<AlertKind, string> = {
  confirmed: COLORS.doneInk,
  proposed: COLORS.noteWarnInk,
  cancelled: COLORS.alertInk,
  message: COLORS.brand,
};

function EmptyNote() {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Icon name="bell" size={40} color={COLORS.brandMuted} />
      <Text className="mt-4 text-center text-body-lg font-bold text-ink-sub">
        아직 온 소식이 없어요
      </Text>
      <Text className="mt-2 text-center text-body text-ink-muted">
        담당자가 답하면{"\n"}여기로 알려드릴게요
      </Text>
    </View>
  );
}

export function AlertListScreen({
  alerts,
  lastSeen,
  onOpen,
}: {
  alerts: readonly Alert[];
  /** 마지막으로 본 시각. 이보다 늦게 온 것에 점을 찍는다. */
  lastSeen: string | null;
  onOpen: (a: Alert) => void;
}) {
  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top"]}>
      <AppHeader />
      <View className="border-b border-line bg-white px-5 pb-4">
        <Text className="text-heading font-extrabold text-ink-strong">알림</Text>
      </View>

      {alerts.length === 0 ? (
        <EmptyNote />
      ) : (
        <ScrollView className="flex-1">
          {alerts.map((a) => {
            const unseen = lastSeen === null || a.at > lastSeen;
            return (
              <Pressable
                key={a.id}
                onPress={() => onOpen(a)}
                accessibilityRole="button"
                accessibilityLabel={`${a.title}. ${a.body}`}
                className="flex-row items-start gap-3 border-b border-line bg-white px-5 py-4 active:opacity-90"
              >
                {/* 안 읽은 것에만 점을 찍는다. 자리는 늘 잡아 두어야 글이 밀리지 않는다 */}
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    marginTop: 8,
                    backgroundColor: unseen ? COLORS.alert : "transparent",
                  }}
                />

                <Icon name={ICON[a.kind]} size={24} color={TONE[a.kind]} />

                <View className="min-w-0 flex-1">
                  <Text className="text-body-lg font-bold text-ink-strong">{a.title}</Text>
                  {a.body ? (
                    <Text className="mt-1 text-body text-ink-sub">{a.body}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
