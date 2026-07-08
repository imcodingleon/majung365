import { Tabs } from "expo-router";
import { Text } from "react-native";

// 하단 5탭 — 홈 / 로드맵 / 상담 / 지도 / 내 정보 (design-map: 로드맵 화면 2:1614이 네비 정본).
// 아이콘은 임시 이모지 — Figma 실측 후 교체한다.
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#208AEF",
        tabBarInactiveTintColor: "#9AA0A6",
        tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "홈", tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} /> }}
      />
      <Tabs.Screen
        name="roadmap"
        options={{ title: "로드맵", tabBarIcon: ({ focused }) => <TabIcon emoji="🗺️" focused={focused} /> }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: "상담", tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} /> }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: "지도", tabBarIcon: ({ focused }) => <TabIcon emoji="📍" focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "내 정보", tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
      />
    </Tabs>
  );
}
