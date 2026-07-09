import { type Href, router, Tabs, usePathname } from "expo-router";
import { Text, View } from "react-native";

import {
  DesktopNavbar,
  DesktopSidebar,
  DesktopTabStrip,
} from "@/shared/components/DesktopShell";
import { useIsDesktop } from "@/shared/hooks/useIsDesktop";

// 하단 5탭 — 홈 / 로드맵 / 상담 / 지도 / 내 정보 (design-map: 로드맵 화면 2:1614이 네비 정본).
// 아이콘은 임시 이모지 — Figma 실측 후 교체한다.
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  const isDesktop = useIsDesktop();
  const pathname = usePathname();
  // typedRoutes 엄격 Href 캐스트는 이 1곳에만 집중.
  const go = (href: string): void => router.push(href as Href);

  // 데스크톱(≥1024): navbar + 탭스트립 + 사이드바 셸(majung365_web_v2 시안). 미만: 기존 하단 탭바.
  // <Tabs>는 항상 같은 트리 위치(단일 인스턴스 + null 형제) — 브레이크포인트 교차 시
  // 리마운트 없이 화면 상태(챗 대화 등)가 보존된다. 탭바 숨김은 tabBarStyle display로만.
  return (
    <View className="flex-1 bg-paper-50">
      {isDesktop ? <DesktopNavbar pathname={pathname} onNavigate={go} /> : null}
      {isDesktop ? <DesktopTabStrip pathname={pathname} onNavigate={go} /> : null}
      <View className="flex-1 flex-row">
        {isDesktop ? <DesktopSidebar pathname={pathname} onNavigate={go} /> : null}
        <View className="flex-1">
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: "#208AEF",
              tabBarInactiveTintColor: "#9AA0A6",
              tabBarStyle: isDesktop
                ? { display: "none" }
                : { height: 64, paddingBottom: 8, paddingTop: 6 },
              tabBarLabelStyle: { fontSize: 12 },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: "홈",
                tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
              }}
            />
            <Tabs.Screen
              name="roadmap"
              options={{
                title: "로드맵",
                tabBarIcon: ({ focused }) => <TabIcon emoji="🗺️" focused={focused} />,
              }}
            />
            <Tabs.Screen
              name="chat"
              options={{
                title: "상담",
                tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
              }}
            />
            <Tabs.Screen
              name="map"
              options={{
                title: "지도",
                tabBarIcon: ({ focused }) => <TabIcon emoji="📍" focused={focused} />,
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                title: "내 정보",
                tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
              }}
            />
          </Tabs>
        </View>
      </View>
    </View>
  );
}
