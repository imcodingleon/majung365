import { Image } from "expo-image";
import { type Href, router, Tabs, usePathname } from "expo-router";
import type { ImageSourcePropType } from "react-native";
import { View } from "react-native";

import {
  DesktopNavbar,
  DesktopSidebar,
  DesktopTabStrip,
} from "@/shared/components/DesktopShell";
import { useIsDesktop } from "@/shared/hooks/useIsDesktop";

// 하단 5탭 — 홈 / 로드맵 / 상담 / 지도 / 내 정보 (design-map: 로드맵 화면 2:1614이 네비 정본).
// 아이콘은 Figma 원본(2:428 하단 네비). 라인 아이콘은 tintColor로 활성/비활성, 상담은 컬러 FAB 그대로.
const NAV_ICONS = {
  home: require("../../../assets/images/nav/home.png") as ImageSourcePropType,
  roadmap: require("../../../assets/images/nav/roadmap.png") as ImageSourcePropType,
  chat: require("../../../assets/images/nav/chat.png") as ImageSourcePropType,
  map: require("../../../assets/images/nav/map.png") as ImageSourcePropType,
  profile: require("../../../assets/images/nav/profile.png") as ImageSourcePropType,
};

function TabIcon({ source, focused }: { source: ImageSourcePropType; focused: boolean }) {
  return (
    <Image
      source={source}
      style={{ width: 24, height: 24 }}
      contentFit="contain"
      tintColor={focused ? "#208AEF" : "#9AA0A6"}
    />
  );
}

function CenterTabIcon({ source }: { source: ImageSourcePropType }) {
  // 상담(센터) — 컬러 FAB 아이콘, 틴트 없이 살짝 크게 표시해 강조.
  return <Image source={source} style={{ width: 34, height: 34 }} contentFit="contain" />;
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
                tabBarIcon: ({ focused }) => <TabIcon source={NAV_ICONS.home} focused={focused} />,
              }}
            />
            <Tabs.Screen
              name="roadmap"
              options={{
                title: "로드맵",
                tabBarIcon: ({ focused }) => (
                  <TabIcon source={NAV_ICONS.roadmap} focused={focused} />
                ),
              }}
            />
            <Tabs.Screen
              name="chat"
              options={{
                title: "상담",
                tabBarIcon: () => <CenterTabIcon source={NAV_ICONS.chat} />,
              }}
            />
            <Tabs.Screen
              name="map"
              options={{
                title: "지도",
                tabBarIcon: ({ focused }) => <TabIcon source={NAV_ICONS.map} focused={focused} />,
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                title: "내 정보",
                tabBarIcon: ({ focused }) => (
                  <TabIcon source={NAV_ICONS.profile} focused={focused} />
                ),
              }}
            />
          </Tabs>
        </View>
      </View>
    </View>
  );
}
