// PC(≥1024px) 셸 — 디자이너 시안 majung365_web_v2.html 기반.
// 순수 UI(stateless): expo-router 미임포트, 네비게이션은 onNavigate/onService로 주입받는다.
// 아이콘은 모바일과 동일한 Figma 원본 PNG(배경 투명 남색 글리프). 이모지 제거.
import { Image, type ImageSourcePropType, Pressable, ScrollView, Text, View } from "react-native";

import { Logo } from "./Logo";

const IC = {
  chat: require("../../../assets/images/nav/chat_navy.png") as ImageSourcePropType,
  onboarding: require("../../../assets/images/nav/profile_on.png") as ImageSourcePropType,
  roadmap: require("../../../assets/images/nav/roadmap_on.png") as ImageSourcePropType,
  map: require("../../../assets/images/nav/map_on.png") as ImageSourcePropType,
  identity: require("../../../assets/images/home/identity.png") as ImageSourcePropType,
  housing: require("../../../assets/images/home/housing.png") as ImageSourcePropType,
  welfare: require("../../../assets/images/home/welfare.png") as ImageSourcePropType,
  employment: require("../../../assets/images/home/employment.png") as ImageSourcePropType,
  health: require("../../../assets/images/home/health.png") as ImageSourcePropType,
  debt: require("../../../assets/images/home/debt.png") as ImageSourcePropType,
};

export interface ShellNavItem {
  key: string;
  label: string;
  href: string;
  icon: ImageSourcePropType;
}

// D7: 시안 nav에는 챗 링크가 없지만 챗이 데모 메인 → "AI 상담"을 첫 항목으로 추가(의도된 이탈).
export const SHELL_MENU: readonly ShellNavItem[] = [
  { key: "chat", label: "AI 상담", href: "/chat", icon: IC.chat },
  { key: "onboarding", label: "상황 체크인", href: "/onboarding", icon: IC.onboarding },
  { key: "roadmap", label: "오늘의 로드맵", href: "/roadmap", icon: IC.roadmap },
  { key: "map", label: "센터 찾기", href: "/map", icon: IC.map },
];

// 서비스 섹션 — 초기 진단 6분야와 1:1. 클릭 시 관련 질문으로 챗 이동(모바일 홈 타일과 동일 질문).
interface ServiceItem {
  label: string;
  icon: ImageSourcePropType;
  question: string;
}
const SERVICE_ITEMS: readonly ServiceItem[] = [
  {
    label: "신분증 / 인증",
    icon: IC.identity,
    question: "신분증하고 통장, 휴대폰을 다시 만들고 싶어요. 어디서부터 해야 하나요?",
  },
  {
    label: "머물 곳 찾기",
    icon: IC.housing,
    question: "당장 지낼 곳이 없어요. 오늘 머물 수 있는 곳을 알려주세요.",
  },
  {
    label: "지원제도 찾기",
    icon: IC.welfare,
    question: "생활비가 없어요. 긴급복지 같은 지원을 받고 싶어요.",
  },
  {
    label: "일자리 찾기",
    icon: IC.employment,
    question: "전과가 있어도 할 수 있는 일자리를 찾고 싶어요.",
  },
  {
    label: "마음 돌보기",
    icon: IC.health,
    question: "요즘 마음이 너무 힘들어요. 상담을 받고 싶어요.",
  },
  {
    label: "빚 문제 해결",
    icon: IC.debt,
    question: "빚 때문에 너무 힘들어요. 채무 조정을 받고 싶어요.",
  },
];

interface ShellProps {
  pathname: string;
  onNavigate: (href: string) => void;
}
interface SidebarProps extends ShellProps {
  /** 서비스 항목 클릭 → 관련 질문으로 챗 이동. */
  onService: (question: string) => void;
}

function isActive(pathname: string, href: string): boolean {
  return pathname.startsWith(href);
}

function NavIcon({ source, size = 18 }: { source: ImageSourcePropType; size?: number }) {
  return <Image source={source} resizeMode="contain" style={{ width: size, height: size }} />;
}

export function DesktopNavbar({ pathname, onNavigate }: ShellProps) {
  const links = SHELL_MENU.filter((m) => m.key !== "chat");
  return (
    <View className="h-[60px] flex-row items-center justify-between bg-navy-800 px-10">
      <Pressable onPress={() => onNavigate("/chat")}>
        <Logo height={30} />
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
            className={`flex-row items-center gap-1.5 px-5 py-3.5 ${
              active ? "border-b-2 border-navy-800" : ""
            }`}
            onPress={() => onNavigate(item.href)}
          >
            <NavIcon source={item.icon} size={16} />
            <Text
              className={`text-sm ${active ? "font-semibold text-navy-800" : "text-paper-600"}`}
            >
              {item.label}
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

export function DesktopSidebar({ pathname, onNavigate, onService }: SidebarProps) {
  return (
    <View className="w-[240px] border-r border-paper-border bg-white">
      <ScrollView contentContainerClassName="gap-1 px-3.5 py-5">
        <SidebarSectionLabel label="메뉴" />
        {SHELL_MENU.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Pressable
              key={item.key}
              className={`flex-row items-center gap-2.5 rounded-[10px] px-3.5 py-2 active:bg-navy-100 ${
                active ? "bg-navy-100" : ""
              }`}
              onPress={() => onNavigate(item.href)}
            >
              <NavIcon source={item.icon} />
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
          <Pressable
            key={item.label}
            className="flex-row items-center gap-2.5 rounded-[10px] px-3.5 py-2 active:bg-navy-100"
            onPress={() => onService(item.question)}
          >
            <NavIcon source={item.icon} />
            <Text className="text-[13px] text-paper-600">{item.label}</Text>
          </Pressable>
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
