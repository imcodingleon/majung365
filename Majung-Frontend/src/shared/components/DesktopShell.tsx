// PC(≥1024px) 셸 — 디자이너 시안 majung365_web_v2.html 기반.
// 순수 UI(stateless): expo-router 미임포트, 네비게이션은 onNavigate로 주입받는다.
// 아이콘은 의존성 없이 유니코드 글리프(시안의 Tabler 웹폰트는 새 의존성이라 미도입).
import { Pressable, ScrollView, Text, View } from "react-native";

export interface ShellNavItem {
  key: string;
  label: string;
  href: string;
  glyph: string;
}

// D7: 시안 nav에는 챗 링크가 없지만 챗이 데모 메인 → "AI 상담"을 첫 항목으로 추가(의도된 이탈).
export const SHELL_MENU: readonly ShellNavItem[] = [
  { key: "chat", label: "AI 상담", href: "/chat", glyph: "💬" },
  { key: "onboarding", label: "상황 체크인", href: "/onboarding", glyph: "📝" },
  { key: "roadmap", label: "오늘의 로드맵", href: "/roadmap", glyph: "🗓️" },
  { key: "map", label: "센터 찾기", href: "/map", glyph: "📍" },
];

// 서비스 섹션 — 6영역과 1:1. 표시 전용(Non-goal: 기능 없음).
const SERVICE_ITEMS: readonly { label: string; glyph: string }[] = [
  { label: "신분증 / 인증", glyph: "🪪" },
  { label: "머물 곳 찾기", glyph: "🏠" },
  { label: "지원제도 찾기", glyph: "📋" },
  { label: "일자리 찾기", glyph: "💼" },
  { label: "마음 돌보기", glyph: "💚" },
  { label: "빚 문제 해결", glyph: "💳" },
];

interface ShellProps {
  pathname: string;
  onNavigate: (href: string) => void;
}

function isActive(pathname: string, href: string): boolean {
  return pathname.startsWith(href);
}

export function DesktopNavbar({ pathname, onNavigate }: ShellProps) {
  const links = SHELL_MENU.filter((m) => m.key !== "chat");
  return (
    <View className="h-[60px] flex-row items-center justify-between bg-navy-800 px-10">
      <Pressable onPress={() => onNavigate("/chat")}>
        <Text className="text-xl font-semibold text-navy-100">
          마중<Text className="text-sun-500">365</Text>
        </Text>
      </Pressable>
      <View className="flex-row items-center gap-7">
        {links.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Pressable key={item.key} onPress={() => onNavigate(item.href)}>
              <Text
                className={`text-sm ${
                  active
                    ? "border-b-2 border-sun-500 pb-0.5 font-medium text-white"
                    : "text-navy-200"
                }`}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const TAB_STRIP_ITEMS = SHELL_MENU.filter((m) => m.key !== "chat");

export function DesktopTabStrip({ pathname, onNavigate }: ShellProps) {
  return (
    <View className="flex-row border-b border-paper-border bg-white px-6">
      {TAB_STRIP_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Pressable
            key={item.key}
            className={`px-5 py-3.5 ${active ? "border-b-2 border-navy-800" : ""}`}
            onPress={() => onNavigate(item.href)}
          >
            <Text
              className={`text-sm ${active ? "font-semibold text-navy-800" : "text-paper-600"}`}
            >
              {item.glyph} {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SidebarSectionLabel({ label }: { label: string }) {
  return (
    <Text className="px-3 pb-1 pt-2.5 text-[11px] font-semibold tracking-widest text-paper-300">
      {label}
    </Text>
  );
}

function SidebarDivider() {
  return <View className="my-1.5 h-px bg-paper-border" />;
}

export function DesktopSidebar({ pathname, onNavigate }: ShellProps) {
  return (
    <View className="w-[240px] border-r border-paper-border bg-white">
      <ScrollView contentContainerClassName="gap-1 px-3.5 py-5">
        <SidebarSectionLabel label="메뉴" />
        {SHELL_MENU.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Pressable
              key={item.key}
              className={`flex-row items-center gap-2.5 rounded-[10px] px-3.5 py-2 ${
                active ? "bg-navy-100" : ""
              }`}
              onPress={() => onNavigate(item.href)}
            >
              <Text className="text-base">{item.glyph}</Text>
              <Text
                className={`text-[13px] ${
                  active ? "font-medium text-navy-800" : "text-paper-600"
                }`}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
        <SidebarDivider />
        <SidebarSectionLabel label="서비스" />
        {SERVICE_ITEMS.map((item) => (
          <View key={item.label} className="flex-row items-center gap-2.5 px-3.5 py-2 opacity-70">
            <Text className="text-base">{item.glyph}</Text>
            <Text className="text-[13px] text-paper-600">{item.label}</Text>
          </View>
        ))}
        <SidebarDivider />
        <View className="flex-row items-center gap-2.5 px-3.5 py-2 opacity-70">
          <Text className="text-base">⚙️</Text>
          <Text className="text-[13px] text-paper-600">설정</Text>
        </View>
      </ScrollView>
    </View>
  );
}
