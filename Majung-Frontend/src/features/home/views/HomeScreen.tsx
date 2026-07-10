// 홈 화면 (Figma 2:428). 히어로 + '자주 찾는 서비스' 6타일 + 상담 CTA.
// 타일 탭 → 챗으로 이동하며 관련 질문 자동 전송(params.q). 아이콘은 Figma 원본(PNG).
import { Image } from "expo-image";
import { type Href, router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Logo } from "@/shared/components/Logo";
import { useIsDesktop } from "@/shared/hooks/useIsDesktop";

import { HOME_SERVICES, type HomeService } from "../domain/services";

const BELL = require("../../../../assets/images/home/bell.png");

function ServiceCard({ service }: { service: HomeService }) {
  return (
    <Pressable
      className="w-[48%] rounded-xl bg-white p-5 shadow active:opacity-90 lg:w-[31%]"
      onPress={() => router.push({ pathname: "/chat", params: { q: service.question } } as Href)}
    >
      <View
        className="size-12 items-center justify-center rounded-lg"
        style={{ backgroundColor: service.iconBg }}
      >
        <Image
          source={service.icon}
          style={{ width: 22, height: 22 }}
          contentFit="contain"
        />
      </View>
      <Text className="mt-4 text-base font-bold text-[#024f9f]">{service.title}</Text>
      <Text className="mt-1 text-xs leading-5 text-[#8f8f8f]">{service.desc}</Text>
    </Pressable>
  );
}

export function HomeScreen() {
  const isDesktop = useIsDesktop();
  return (
    <SafeAreaView className="flex-1 bg-[#f9fbff]" edges={["top"]}>
      {/* 모바일 헤더 — 데스크톱은 셸 navbar가 대체 */}
      <View className="flex-row items-center justify-between border-b border-line bg-white px-5 py-4 lg:hidden">
        <Logo height={26} />
        <Image source={BELL} style={{ width: 18, height: 22 }} contentFit="contain" />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10 pt-5">
        <View className="w-full gap-6 lg:max-w-[860px] lg:self-center">
          {/* 히어로 (Figma 2:582) */}
          <View className="overflow-hidden rounded-[20px] bg-[#024f9f] px-[22px] py-8 lg:px-8">
            {/* 데코 원 (2:583) — 우하단 연한 파랑, 살짝만 보이게 */}
            <View
              className="absolute rounded-full bg-[#91c9f8]"
              style={{ width: 192, height: 192, right: -48, bottom: -48, opacity: 0.2 }}
            />
            <View style={{ gap: 16 }}>
              <Text className="text-2xl font-semibold text-white" style={{ lineHeight: 34 }}>
                환영합니다.{"\n"}사회로의 첫걸음,{"\n"}마중365가 함께합니다.
              </Text>
              <Text
                className="text-base font-medium text-[#efefef]"
                style={{ lineHeight: 29, opacity: 0.9 }}
              >
                {isDesktop
                  ? "지금 가장 막막하거나 도움이 필요한 부분은 무엇인가요? 당신의 곁에서 차근차근 도와드릴게요."
                  : "지금 가장 막막하거나 도움이 필요한 부분은\n무엇인가요?\n당신의 곁에서 차근차근 도와드릴게요."}
              </Text>
            </View>
          </View>

          <Text className="text-xl font-bold text-[#1d1b20]">자주 찾는 서비스</Text>

          {/* 서비스 그리드 (2열, 데스크톱 3열) */}
          <View className="flex-row flex-wrap justify-between gap-y-4 lg:justify-start lg:gap-4">
            {HOME_SERVICES.map((s) => (
              <ServiceCard key={s.id} service={s} />
            ))}
          </View>

          {/* 상담 시작 CTA */}
          <View className="mt-2 flex-row items-center justify-between rounded-[20px] bg-white p-6 shadow">
            <View className="flex-1 pr-3">
              <Text className="text-base font-bold text-[#024f9f]">도움이 필요하신가요?</Text>
              <Text className="mt-1 text-xs text-[#8f8f8f]">전문 상담사가 24시간 대기 중입니다.</Text>
            </View>
            <Pressable
              className="rounded-full bg-[#fa8504] px-4 py-2 active:opacity-90"
              onPress={() => router.push("/chat")}
            >
              <Text className="text-base font-bold text-white">상담 시작</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
