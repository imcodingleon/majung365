import { type Href, router, Tabs, usePathname } from "expo-router";
import {
  type GestureResponderEvent,
  Image,
  type ImageSourcePropType,
  Pressable,
  Text,
  View,
} from "react-native";

import {
  DesktopNavbar,
  DesktopSidebar,
  DesktopTabStrip,
} from "@/shared/components/DesktopShell";
import { useIsDesktop } from "@/shared/hooks/useIsDesktop";

// 하단 5탭 — Figma 원본 아이콘(2:428 하단 네비). 배경 투명 + 활성(남색)/비활성(회색) 사전 색칠본을
// 그대로 렌더(웹 tintColor 마스크 버그 회피 — 순수 이미지가 확실).
const NAV_ICONS = {
  home: {
    on: require("../../../assets/images/nav/home_on.png") as ImageSourcePropType,
    off: require("../../../assets/images/nav/home_off.png") as ImageSourcePropType,
  },
  roadmap: {
    on: require("../../../assets/images/nav/roadmap_on.png") as ImageSourcePropType,
    off: require("../../../assets/images/nav/roadmap_off.png") as ImageSourcePropType,
  },
  map: {
    on: require("../../../assets/images/nav/map_on.png") as ImageSourcePropType,
    off: require("../../../assets/images/nav/map_off.png") as ImageSourcePropType,
  },
  profile: {
    on: require("../../../assets/images/nav/profile_on.png") as ImageSourcePropType,
    off: require("../../../assets/images/nav/profile_off.png") as ImageSourcePropType,
  },
};
const CHAT_GLYPH = require("../../../assets/images/nav/chat_glyph.png") as ImageSourcePropType;

type IconPair = { on: ImageSourcePropType; off: ImageSourcePropType };

function TabIcon({ icon, focused }: { icon: IconPair; focused: boolean }) {
  return (
    <Image
      source={focused ? icon.on : icon.off}
      resizeMode="contain"
      style={{ width: 24, height: 24 }}
    />
  );
}

// 상담(센터) — Figma 하단 네비처럼 파란 원을 바 위로 자연스럽게 띄운다(흰 링 + 그림자 + 흰 챗 글리프).
// 커스텀 tabBarButton으로 아이콘 슬롯 제약을 벗어나 원을 크게/위로 배치.
function ChatFabButton({ onPress }: { onPress?: (e: GestureResponderEvent) => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="상담"
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <View
        style={{
          width: 58,
          height: 58,
          borderRadius: 29,
          marginTop: -26,
          backgroundColor: "#024f9f",
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 4,
          borderColor: "#ffffff",
          shadowColor: "#024f9f",
          shadowOpacity: 0.3,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 6,
        }}
      >
        <Image source={CHAT_GLYPH} resizeMode="contain" style={{ width: 26, height: 26 }} />
      </View>
      <Text style={{ fontSize: 12, color: "#9AA0A6", marginTop: 5 }}>상담</Text>
    </Pressable>
  );
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
              tabBarActiveTintColor: "#024f9f",
              tabBarInactiveTintColor: "#9AA0A6",
              tabBarStyle: isDesktop
                ? { display: "none" }
                : { height: 74, paddingBottom: 12, paddingTop: 8, overflow: "visible" },
              tabBarLabelStyle: { fontSize: 11, marginTop: 2 },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: "홈",
                tabBarIcon: ({ focused }) => <TabIcon icon={NAV_ICONS.home} focused={focused} />,
              }}
            />
            <Tabs.Screen
              name="roadmap"
              options={{
                title: "로드맵",
                tabBarIcon: ({ focused }) => (
                  <TabIcon icon={NAV_ICONS.roadmap} focused={focused} />
                ),
              }}
            />
            <Tabs.Screen
              name="chat"
              options={{
                title: "상담",
                tabBarButton: (props) => <ChatFabButton onPress={props.onPress} />,
              }}
            />
            <Tabs.Screen
              name="map"
              options={{
                title: "지도",
                tabBarIcon: ({ focused }) => <TabIcon icon={NAV_ICONS.map} focused={focused} />,
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                title: "내 정보",
                tabBarIcon: ({ focused }) => (
                  <TabIcon icon={NAV_ICONS.profile} focused={focused} />
                ),
              }}
            />
          </Tabs>
        </View>
      </View>
    </View>
  );
}
