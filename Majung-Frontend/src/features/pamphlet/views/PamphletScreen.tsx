// 팜플렛 미리보기 (§2.1·§2.2).
//
// **실사용자가 보는 화면이 아니다.** 팜플렛은 공단을 통해 교정시설에 배포되는 실물 인쇄물이고,
// 사용자는 그것을 보고 앱을 설치한다. 이 화면은 심사와 팀 시연에서 팜플렛이 어떤 모양인지
// 보여주는 자리다 (§2.6의 웹 용도와 같다).
//
// QR 이미지는 아직 넣지 않았다. 아이폰 주소가 확정되지 않았고(§12-6), QR 생성 라이브러리를
// 넣으려면 의존성 추가 확인이 필요하다. 주소가 정해지면 storeLinks.ts의 값만 채우면 된다.
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "@/shared/theme/colors";

import { STORE_LINKS, type StoreLink } from "../domain/storeLinks";

type Props = {
  onClose?: () => void;
};

function QrSlot({ link }: { link: StoreLink }) {
  const ready = link.url !== null;
  return (
    <View className="flex-1 items-center rounded-2xl border-[1.5px] border-line bg-white px-3 py-5">
      <View
        className="size-32 items-center justify-center rounded-xl border-2 border-dashed"
        style={{ borderColor: ready ? COLORS.brandMuted : COLORS.line }}
      >
        <Text className="text-center text-[13px] leading-[20px] text-ink-muted">
          {ready ? "QR 자리" : link.pendingReason}
        </Text>
      </View>

      <Text className="mt-3 text-[17px] font-extrabold text-ink-strong">{link.label}</Text>
      <Text className="mt-1 text-center text-sm leading-[22px] text-ink-sub">{link.hint}</Text>
    </View>
  );
}

export function PamphletScreen({ onClose }: Props) {
  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between border-b border-line bg-white px-5 py-4">
        <Text className="text-lg font-extrabold text-ink-strong">안내 팜플렛</Text>
        {onClose ? (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="닫기"
            className="size-10 items-center justify-center rounded-full active:opacity-70"
          >
            <Text className="text-2xl text-ink-muted">✕</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-12 pt-6">
        {/* 심사·시연용 화면이라는 것을 화면에서도 밝힌다. 실사용 경로로 오해하지 않게 한다. */}
        <View className="mb-6 rounded-xl border border-note-warn-line bg-note-warn px-4 py-3">
          <Text className="text-sm leading-[23px] text-note-warn-ink">
            실제로는 종이 팜플렛으로 나가요. 이 화면은 어떤 모양인지 보여주는 자리예요.
          </Text>
        </View>

        <Text className="text-[26px] font-extrabold leading-[36px] text-ink-strong">
          나가시는 길에{"\n"}
          <Text className="text-brand">마중365</Text>가 함께합니다
        </Text>
        <Text className="mb-8 mt-3 text-base leading-[27px] text-ink-sub">
          무엇부터 해야 할지 하나씩 알려드려요.{"\n"}
          전화로 물어볼 곳도 함께 알려드려요.
        </Text>

        <Text className="mb-3 text-[19px] font-extrabold text-ink-strong">앱 받는 방법</Text>
        <View className="mb-4 rounded-2xl bg-white px-4 py-4">
          <Text className="mb-1.5 text-base leading-[26px] text-ink-body">
            ① 쓰시는 폰을 고르세요.
          </Text>
          <Text className="mb-1.5 text-base leading-[26px] text-ink-body">
            ② 폰 카메라로 아래 그림을 비추세요.
          </Text>
          <Text className="text-base leading-[26px] text-ink-body">
            ③ 화면에 나오는 대로 눌러서 받으세요.
          </Text>
        </View>

        <View className="flex-row gap-3">
          {STORE_LINKS.map((link) => (
            <QrSlot key={link.label} link={link} />
          ))}
        </View>

        <View className="mt-8 rounded-xl border border-note-info-line bg-note-info px-4 py-4">
          <Text className="text-[15px] font-extrabold leading-[25px] text-note-info-ink">
            선불폰으로도 받으실 수 있어요
          </Text>
          <Text className="mt-1.5 text-sm leading-[24px] text-note-info-ink">
            자세한 방법은 팜플렛 뒷면에 적혀 있어요.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
