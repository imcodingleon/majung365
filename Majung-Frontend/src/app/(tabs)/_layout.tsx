// 하단 메뉴바 다섯 칸.
//
// **본선에서 되살린 것이다.** 기획서 §5.1이 예선의 5탭을 폐기했으나, 그 뒤로 화면이
// 여섯 개로 늘어 이동 수단이 다시 필요해졌다. 근거는 `decision-log-2026-08-26.md` B-1에 있다.
//
// **아코디언은 폐기하지 않았다.** 서류철 인덱스 탭과 열림 규칙(§5.2)은 그대로이며 홈 칸
// 안에 들어간다. 되돌린 것은 화면 사이의 이동 수단 하나다.
//
// 가입·상황 다시 알아보기·팜플렛·담당자 화면은 이 그룹 밖에 있다 — 가입하는 중에 하단 바가
// 보이면 안 되기 때문이다.
//
// 괄호로 묶은 폴더는 주소에 나타나지 않는다. `(tabs)/today.tsx`는 그대로 `/today`다.
import { type GestureResponderEvent, Pressable, Text, View } from "react-native";
import { Tabs } from "expo-router";

import { countUnseen, toAlerts } from "@/features/alerts/domain/alert";
import { useLastSeen } from "@/features/alerts/hooks/useLastSeen";
import {
  useVisitRequests,
  VisitRequestsProvider,
} from "@/features/visit/hooks/useVisitRequests";
import { Icon, type IconName } from "@/shared/components/Icon";
import { TabBadge } from "@/shared/components/TabBadge";
import { COLORS } from "@/shared/theme/colors";
import { FONTS } from "@/shared/theme/fonts";

// **색을 `tabBarIcon`이 주는 값으로 받지 않는다.** 그 값은 `ColorValue`라서 플랫폼이
// 불투명한 객체를 넘길 수 있고, SVG의 `stroke`는 문자열만 받는다. 켜짐과 꺼짐 두 색을
// 여기서 직접 고르면 타입도 맞고 어느 색인지도 코드에 드러난다.
function TabIcon({ name, focused, badge }: { name: IconName; focused: boolean; badge?: number }) {
  return (
    <View>
      <Icon name={name} size={24} color={focused ? COLORS.brand : COLORS.inkMuted} />
      {badge === undefined ? null : <TabBadge count={badge} />}
    </View>
  );
}

// 상담은 바 위로 솟은 파란 원이다. 슬롯 밖으로 나가야 하므로 절대 위치로 올린다
// (바깥 `tabBarStyle`에 `overflow: visible`이 있어야 잘리지 않는다).
function ChatFabButton({
  onPress,
  badge,
}: {
  onPress?: (e: GestureResponderEvent) => void;
  badge?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="상담"
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 2 }}
    >
      <View
        style={{
          position: "absolute",
          top: -34,
          width: 66,
          height: 66,
          borderRadius: 33,
          backgroundColor: COLORS.brand,
          borderWidth: 5,
          borderColor: "#fafafa",
          alignItems: "center",
          justifyContent: "center",
          // 웹은 `boxShadow`, 안드로이드는 `elevation`이다. `shadow*` 네 속성은 웹에서
          // 더 이상 권장되지 않아 콘솔 경고가 난다.
          boxShadow: "0px 2px 5px rgba(0, 0, 0, 0.18)",
          elevation: 8,
        }}
      >
        <Icon name="chat" size={29} color={COLORS.surface} />
        {badge === undefined ? null : <TabBadge count={badge} />}
      </View>
      <Text style={{ fontSize: 11, color: COLORS.inkMuted, fontFamily: FONTS.semibold }}>상담</Text>
    </Pressable>
  );
}

/**
 * 하단 바 자체.
 *
 * **Provider 안쪽이라야 한다.** 방문 요청 목록을 화면들과 나눠 써야 하기 때문이다 —
 * 각자 들면 대화를 읽어 서버에서 0이 된 뒤에도 바의 숫자가 그대로 남는다.
 */
function TabsBar() {
  // **숫자는 여기서 한 번만 센다.** 알림 탭과 상담 탭이 각자 세면 같은 셈이 두 곳에
  // 생기고, 한쪽 규칙만 고쳤을 때 바에 뜬 수와 화면 안 수가 어긋난다.
  const visit = useVisitRequests();
  const { lastSeen } = useLastSeen();
  const alertCount = countUnseen(toAlerts(visit.requests), lastSeen);
  const chatCount = visit.requests.reduce((sum, r) => sum + r.unread, 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.brand,
        tabBarInactiveTintColor: COLORS.inkMuted,
        tabBarStyle: { height: 74, paddingBottom: 12, paddingTop: 8, overflow: "visible" },
        tabBarLabelStyle: { fontSize: 11, marginTop: 2, fontFamily: FONTS.semibold },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: "홈",
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "알림",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="bell" focused={focused} badge={alertCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: "상담",
          tabBarButton: (props) => <ChatFabButton onPress={props.onPress} badge={chatCount} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "지도",
          tabBarIcon: ({ focused }) => <TabIcon name="pin" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="my-info"
        options={{
          title: "내 정보",
          tabBarIcon: ({ focused }) => <TabIcon name="person" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

export default function TabsLayout() {
  return (
    <VisitRequestsProvider>
      <TabsBar />
    </VisitRequestsProvider>
  );
}
