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
import { NoteBox, NoteLine } from "@/shared/components/NoteBox";
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

function InstitutionCard({ item }: { item: Institution }) {
  const dial = item.phone.replace(/[^0-9]/g, "");
  return (
    <View className="mb-3 rounded-2xl border-[1.5px] border-line bg-white px-4 py-4">
      <Text className="text-body-lg font-extrabold text-ink-strong">
        {item.name}
        {item.note ? <Text className="text-body font-semibold text-ink-sub"> ({item.note})</Text> : null}
      </Text>
      <Text className="mt-2 text-body text-ink-body">{item.address}</Text>

      <Pressable
        onPress={() => {
          Linking.openURL(`tel:${dial}`).catch(() => {
            // 전화 앱이 없는 기기에서는 아무 일도 일어나지 않는다. 번호가 화면에 보이므로
            // 다른 전화기로 걸 수 있다.
          });
        }}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}에 전화하기. ${item.phone}`}
        className="mt-3 flex-row items-center gap-2 self-start rounded-xl border-[1.5px] border-brand-soft bg-brand-soft px-4 py-3 active:opacity-80"
      >
        <Text className="text-body-lg">📞</Text>
        <Text className="text-body-lg font-extrabold text-brand">{item.phone}</Text>
      </Pressable>
    </View>
  );
}

function Section({ title, items }: { title: string; items: readonly Institution[] }) {
  if (items.length === 0) return null;
  return (
    <View className="mb-6">
      <Text className="mb-3 text-heading font-extrabold text-ink-strong">{title}</Text>
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
            <Text className="text-title font-extrabold text-ink-strong">
              어디로 가면 되는지{"\n"}알려드릴게요
            </Text>
            <Text className="mb-6 mt-3 text-body-lg text-ink-sub">
              지금 계신 지역을 알면 찾아가실 곳을 알려드릴 수 있어요.
            </Text>

            {/* 좌표를 서버로 보내지 않는다는 것을 화면에서 밝힌다. 위치를 켜는 일은
                이 사용자층에게 부담이 큰 결정이라 무엇이 일어나는지 알아야 한다. */}
            <NoteBox tone="info" className="mb-6">
              <NoteLine tone="info">지금 계신 곳이 어느 시·군·구인지만 써요.</NoteLine>
              <NoteLine tone="info" className="mt-1">
                정확한 위치는 저장하지도, 어디로 보내지도 않아요.
              </NoteLine>
            </NoteBox>

            <Pressable
              onPress={onLocate}
              accessibilityRole="button"
              accessibilityLabel="지금 있는 곳으로 찾기"
              className="items-center rounded-2xl bg-brand py-4 active:opacity-90"
            >
              <Text className="text-body-lg font-extrabold text-white">지금 있는 곳으로 찾기</Text>
            </Pressable>

            <Pressable
              onPress={() => onPick({ sido: "", district: null })}
              accessibilityRole="button"
              accessibilityLabel="지역을 직접 고를게요"
              className="mt-3 items-center rounded-2xl border-[1.5px] border-line bg-white py-4 active:opacity-90"
            >
              <Text className="text-body-lg font-bold text-ink-sub">지역을 직접 고를게요</Text>
            </Pressable>
          </View>
        ) : null}

        {state.status === "locating" ? (
          <Text className="mt-10 text-center text-body-lg text-ink-sub">
            지금 계신 곳을 알아보고 있어요…
          </Text>
        ) : null}

        {showPicker || (region !== null && region.sido === "") ? (
          <View>
            {state.status === "denied" ? (
              <Text className="mb-5 text-body text-ink-sub">
                위치를 쓰지 않아도 괜찮아요. 지역을 골라 주세요.
              </Text>
            ) : null}
            {state.status === "failed" ? (
              <NoteBox tone="warn" className="mb-5">
                {state.reason}
              </NoteBox>
            ) : null}
            <RegionPicker onPick={onPick} />
          </View>
        ) : null}

        {region !== null && region.sido !== "" ? (
          <View>
            <View className="mb-5 flex-row items-center justify-between">
              <Text className="text-heading font-extrabold text-ink-strong">
                {region.district ? `${region.sido} ${region.district}` : region.sido}
              </Text>
              <Pressable
                onPress={onReset}
                accessibilityRole="button"
                accessibilityLabel="다른 지역 고르기"
                className="rounded-lg border border-line px-3 py-2 active:opacity-70"
              >
                <Text className="text-caption font-bold text-ink-sub">다른 지역</Text>
              </Pressable>
            </View>

            {institutions === null ? (
              <Text className="mt-6 text-center text-body-lg text-ink-sub">
                찾아가실 곳을 알아보고 있어요…
              </Text>
            ) : (
              <>
                <Section title={kindLabel("branch")} items={institutions.branches} />
                <Section title="마음이 힘들 때 가는 곳" items={institutions.centers} />

                {institutions.branches.length === 0 && institutions.centers.length === 0 ? (
                  <View className="rounded-xl border border-note-warn-line bg-note-warn px-4 py-4">
                    <Text className="text-body text-note-warn-ink">
                      이 지역에서 찾아가실 곳을 아직 못 찾았어요.{"\n"}
                      1670-7004로 전화하시면 알려드려요.
                    </Text>
                  </View>
                ) : null}

                {/* **확인 문장을 내지 않는다.** 화면이 들고 있던 날짜는 다른 파일의
                    것이었고, 이 목록의 데이터에는 확인 날짜가 없다. 서버가 항목마다
                    검증 여부와 날짜를 실어 주면 검증된 것에만 붙인다.

                    확인 날짜가 아예 없는 편이 틀린 날짜가 있는 것보다 낫다 —
                    §6.4가 "확인하지 않은 날짜를 지어내지 않는다"고 정한 자리다*/}
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
            <Text className="text-body font-bold" style={{ color: COLORS.brand }}>
              위치로 다시 찾아볼게요
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
