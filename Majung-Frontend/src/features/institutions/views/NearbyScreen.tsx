// 위치 기반 기관 안내 (§5.4).
//
// "가까운 주민센터", "관할 지부"라고만 하면 사용자는 다시 찾아야 한다. 이름과 주소와
// 전화번호까지 짚어주는 것이 목표다.
//
// 기관 목록은 이 화면이 만들지 않는다. 서버가 시군구를 받아 돌려준다. **좌표는 서버에
// 도달하지 않는다.**
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { COLORS } from "@/shared/theme/colors";

import { kindLabel, type Institution, type RegionInstitutions } from "../domain/institution";
import type { SelectedRegion } from "../domain/region";
import type { LookupState } from "../hooks/useRegionLookup";

import { RegionPicker } from "./RegionPicker";

type Props = {
  state: LookupState;
  region: SelectedRegion | null;
  /** 서버가 돌려준 기관 목록. 아직 받기 전이면 null. */
  institutions: RegionInstitutions | null;
  onLocate: () => void;
  onPick: (region: SelectedRegion) => void;
  onReset: () => void;
  onClose: () => void;
};

function checkedSentence(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return "";
  return `마중365가 ${y}년 ${Number(m)}월 ${Number(d)}일에 확인한 곳이에요.`;
}

function InstitutionCard({ item }: { item: Institution }) {
  const dial = item.phone.replace(/[^0-9]/g, "");
  return (
    <View className="mb-2.5 rounded-2xl border-[1.5px] border-line bg-white px-4 py-4">
      <Text className="text-[17px] font-extrabold text-ink-strong">
        {item.name}
        {item.note ? <Text className="text-[15px] font-semibold text-ink-sub"> ({item.note})</Text> : null}
      </Text>
      <Text className="mt-1.5 text-[15px] leading-[24px] text-ink-body">{item.address}</Text>

      <Pressable
        onPress={() => {
          Linking.openURL(`tel:${dial}`).catch(() => {
            // 전화 앱이 없는 기기에서는 아무 일도 일어나지 않는다. 번호가 화면에 보이므로
            // 다른 전화기로 걸 수 있다.
          });
        }}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}에 전화하기. ${item.phone}`}
        className="mt-3 flex-row items-center gap-2 self-start rounded-xl border-[1.5px] border-brand-soft bg-brand-soft px-4 py-2.5 active:opacity-80"
      >
        <Text className="text-base">📞</Text>
        <Text className="text-base font-extrabold text-brand">{item.phone}</Text>
      </Pressable>
    </View>
  );
}

function Section({ title, items }: { title: string; items: readonly Institution[] }) {
  if (items.length === 0) return null;
  return (
    <View className="mb-6">
      <Text className="mb-2.5 text-[19px] font-extrabold text-ink-strong">{title}</Text>
      {items.map((item) => (
        <InstitutionCard key={`${item.name}-${item.phone}`} item={item} />
      ))}
    </View>
  );
}

export function NearbyScreen({
  state,
  region,
  institutions,
  onLocate,
  onPick,
  onReset,
  onClose,
}: Props) {
  const showPicker = region === null && (state.status === "denied" || state.status === "failed");

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
      <ScreenHeader title="가까운 곳 찾기" closeHint="가까운 곳 찾기 화면 닫기" onClose={onClose} />

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-12 pt-6">
        {region === null && state.status === "idle" ? (
          <View>
            <Text className="text-[21px] font-extrabold leading-[31px] text-ink-strong">
              어디로 가면 되는지{"\n"}알려드릴게요
            </Text>
            <Text className="mb-6 mt-3 text-base leading-[27px] text-ink-sub">
              지금 계신 지역을 알면 찾아가실 곳을 알려드릴 수 있어요.
            </Text>

            {/* 좌표를 서버로 보내지 않는다는 것을 화면에서 밝힌다. 위치를 켜는 일은
                이 사용자층에게 부담이 큰 결정이라 무엇이 일어나는지 알아야 한다. */}
            <View className="mb-6 rounded-xl border border-note-info-line bg-note-info px-4 py-4">
              <Text className="text-sm leading-[24px] text-note-info-ink">
                지금 계신 곳이 어느 시·군·구인지만 써요.
              </Text>
              <Text className="mt-1 text-sm leading-[24px] text-note-info-ink">
                정확한 위치는 저장하지도, 어디로 보내지도 않아요.
              </Text>
            </View>

            <Pressable
              onPress={onLocate}
              accessibilityRole="button"
              accessibilityLabel="지금 있는 곳으로 찾기"
              className="items-center rounded-2xl bg-brand py-4 active:opacity-90"
            >
              <Text className="text-[17px] font-extrabold text-white">지금 있는 곳으로 찾기</Text>
            </Pressable>

            <Pressable
              onPress={() => onPick({ sido: "", district: null })}
              accessibilityRole="button"
              accessibilityLabel="지역을 직접 고를게요"
              className="mt-2.5 items-center rounded-2xl border-[1.5px] border-line bg-white py-4 active:opacity-90"
            >
              <Text className="text-base font-bold text-ink-sub">지역을 직접 고를게요</Text>
            </Pressable>
          </View>
        ) : null}

        {state.status === "locating" ? (
          <Text className="mt-10 text-center text-base text-ink-sub">
            지금 계신 곳을 알아보고 있어요…
          </Text>
        ) : null}

        {showPicker || (region !== null && region.sido === "") ? (
          <View>
            {state.status === "denied" ? (
              <Text className="mb-5 text-[15px] leading-[25px] text-ink-sub">
                위치를 쓰지 않아도 괜찮아요. 지역을 골라 주세요.
              </Text>
            ) : null}
            {state.status === "failed" ? (
              <View className="mb-5 rounded-xl border border-note-warn-line bg-note-warn px-4 py-3.5">
                <Text className="text-sm leading-[24px] text-note-warn-ink">{state.reason}</Text>
              </View>
            ) : null}
            <RegionPicker onPick={onPick} />
          </View>
        ) : null}

        {region !== null && region.sido !== "" ? (
          <View>
            <View className="mb-5 flex-row items-center justify-between">
              <Text className="text-[19px] font-extrabold text-ink-strong">
                {region.district ? `${region.sido} ${region.district}` : region.sido}
              </Text>
              <Pressable
                onPress={onReset}
                accessibilityRole="button"
                accessibilityLabel="다른 지역 고르기"
                className="rounded-lg border border-line px-3 py-2 active:opacity-70"
              >
                <Text className="text-sm font-bold text-ink-sub">다른 지역</Text>
              </Pressable>
            </View>

            {institutions === null ? (
              <Text className="mt-6 text-center text-base text-ink-sub">
                찾아가실 곳을 알아보고 있어요…
              </Text>
            ) : (
              <>
                <Section title={kindLabel("branch")} items={institutions.branches} />
                <Section title="마음이 힘들 때 가는 곳" items={institutions.centers} />

                {institutions.branches.length === 0 && institutions.centers.length === 0 ? (
                  <View className="rounded-xl border border-note-warn-line bg-note-warn px-4 py-4">
                    <Text className="text-[15px] leading-[25px] text-note-warn-ink">
                      이 지역에서 찾아가실 곳을 아직 못 찾았어요.{"\n"}
                      1670-7004로 전화하시면 알려드려요.
                    </Text>
                  </View>
                ) : null}

                {institutions.checkedAt ? (
                  <Text className="mt-2 text-[13px] leading-[21px] text-ink-muted">
                    {checkedSentence(institutions.checkedAt)}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* 위치를 쓰지 않기로 한 뒤에도 색을 죽이지 않는다. 다시 시도할 수 있어야 한다. */}
      {state.status === "denied" && region === null ? (
        <View className="border-t border-line bg-white px-5 py-3">
          <Pressable
            onPress={onLocate}
            accessibilityRole="button"
            accessibilityLabel="위치로 다시 찾기"
            className="items-center py-2 active:opacity-70"
          >
            <Text className="text-[15px] font-bold" style={{ color: COLORS.brand }}>
              위치로 다시 찾아볼게요
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
