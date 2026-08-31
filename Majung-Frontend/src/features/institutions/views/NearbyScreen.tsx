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

import type { DistrictOffice, Institution, NearbyResult } from "../domain/institution";
import {
  byDistanceFrom,
  districtLabel,
  officesByDistance,
  sameSido,
  type LocatedPlace,
} from "@/shared/location";
import type { SelectedRegion } from "../domain/region";
import type { LookupState } from "@/shared/location";

import { RegionPicker } from "./RegionPicker";
import { Icon } from "@/shared/components/Icon";

type Props = {
  state: LookupState;
  /** 위치로 알아냈거나 직접 고른 곳. 아직 정해지지 않았으면 null. */
  place: LocatedPlace | null;
  /** 서버가 돌려준 것. 아직 받기 전이면 null. */
  result: NearbyResult | null;
  loading: boolean;
  /** 불러오지 못했을 때. **빈 목록과 구별해 보여준다.** */
  error: string | null;
  onLocate: () => void;
  onPick: (region: SelectedRegion) => void;
  onReset: () => void;
  onClose: () => void;
};

/**
 * 찾아갈 곳 하나.
 *
 * **전화번호가 없을 수 있다.** 주민센터는 원본(행정안전부 '읍면동 하부행정기관 현황')에
 * 전화번호가 없다. 빈 자리를 만들지 않고 아예 그리지 않는다.
 */
function PlaceCard({
  name,
  address,
  phone,
  badge,
}: {
  name: string;
  address: string;
  phone?: string;
  /** "여기예요"처럼 그 자리에서만 붙는 표시. */
  badge?: string;
}) {
  const dial = phone ? phone.replace(/[^0-9]/g, "") : "";
  return (
    <View className="mb-3 rounded-2xl border-[1.5px] border-line bg-white px-4 py-4">
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-body-lg font-extrabold text-ink-strong">{name}</Text>
        {badge ? (
          <View className="rounded-full bg-brand-soft px-3 py-1">
            <Text className="text-caption font-extrabold text-brand">{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text className="mt-2 text-body text-ink-body">{address}</Text>

      {phone ? (
      <Pressable
        onPress={() => {
          Linking.openURL(`tel:${dial}`).catch(() => {
            // 전화 앱이 없는 기기에서는 아무 일도 일어나지 않는다. 번호가 화면에 보이므로
            // 다른 전화기로 걸 수 있다.
          });
        }}
        accessibilityRole="button"
        accessibilityLabel={`${name}에 전화하기. ${phone}`}
        className="mt-3 flex-row items-center gap-2 self-start rounded-xl border-[1.5px] border-brand-soft bg-brand-soft px-4 py-3 active:opacity-80"
      >
        <Icon name="phone" size={20} color={COLORS.brand} />
        <Text className="text-body-lg font-extrabold text-brand">{phone}</Text>
      </Pressable>
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="mb-3 text-heading font-extrabold text-ink-strong">{title}</Text>
      {children}
    </View>
  );
}

/**
 * 그 사람이 사는 동의 주민센터를 앞에 둔다. 나머지는 같은 구 안의 다른 동이다.
 *
 * **이름을 맞춰 보던 것을 거리로 바꿨다.** 경계 데이터가 "불당동"인데 주민센터는
 * "불당1동"·"불당2동"으로 나뉘어 있는 식이라 이름으로는 어긋난다 — 행정동이 갈라진
 * 시점이 서로 다르다. 주민센터는 동을 알고 있어서 거리를 정확히 잴 수 있다.
 */
function sortOffices(
  offices: readonly DistrictOffice[],
  place: LocatedPlace,
): readonly DistrictOffice[] {
  return officesByDistance(place, offices);
}

/**
 * 그 시군구의 정신건강복지센터.
 *
 * **서버는 시도 단위로 준다.** 송파구를 물어도 서울 17개 구가 다 오고, 그 구의 것이
 * 맨 앞에 온다. 전부 그리면 **엉뚱한 구의 센터가 잔뜩 나온다** — 강남구 센터를 보고
 * 찾아가면 헛걸음이다. 맞는 구만 그리고, 그 구에 없으면 서버가 앞에 둔 하나만 낸다.
 */
function centersFor(
  institutions: readonly Institution[],
  district: string,
): readonly Institution[] {
  const all = institutions.filter((x) => x.kind === "mental_health");
  // **빈 값이면 아무것도 안 낸다.** `"".startsWith("")`가 참이라, 시군구를 모르는
  // 상태에서 거르면 **전국 센터가 다 통과한다** — 막으려던 것이 그대로 일어난다.
  if (!district) return [];
  return all.filter(
    (x) => x.district && (district.startsWith(x.district) || x.district.startsWith(district)),
  );
}

/**
 * 그 광역의 공단 기관.
 *
 * **공단은 시군구가 아니라 광역 단위다.** 응답의 `district`가 아예 비어 있고 `sido`는
 * 짧은 이름("서울")으로 온다. 거르지 않으면 **송파구 사람에게 도봉구 지부가 나오고**,
 * 시군구로 거르면 전부 사라진다.
 */
function branchesFor(
  institutions: readonly Institution[],
  place: LocatedPlace,
): readonly Institution[] {
  const all = institutions.filter((x) => x.kind !== "mental_health");
  // **그 광역에 없으면 아무것도 안 낸다.** 허그상담소는 전국에 세 곳뿐(원주·천안·통영)
  // 이라 서울에는 없는데, 폴백으로 하나를 내면 **서울 사람에게 원주로 가라고 하는 셈**이다.
  // 없는 것을 없다고 두고, 화면 아래 대표번호로 넘긴다.
  //
  // 한 광역에 지부가 여럿이면(서울만 넷) 어느 구가 관할인지 서버도 모른다. 이 화면은
  // 둘러보는 자리이므로 그 광역의 것을 다 보이되, **가까운 것을 위에 둔다.** 순서를
  // 그대로 두면 군포 사람에게 화성 지부가 맨 위에 왔다. 거리는 기기가 들고 있는 경계
  // 데이터로 재므로 좌표가 어디로도 나가지 않는다 (§5.4).
  return byDistanceFrom(
    place,
    all.filter((x) => sameSido(x.sido, place)),
  );
}

export function NearbyScreen({
  state,
  place,
  result,
  loading,
  error,
  onLocate,
  onPick,
  onReset,
  onClose,
}: Props) {
  const showPicker = place === null && (state.status === "denied" || state.status === "failed");

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
      <ScreenHeader title="가까운 곳 찾기" closeHint="가까운 곳 찾기 화면 닫기" onClose={onClose} />

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-12 pt-6">
        {place === null && state.status === "idle" ? (
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
              onPress={() => onPick({ sido: "", district: null, dong: null })}
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

        {showPicker || (place !== null && place.sido === "") ? (
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

        {place !== null && place.sido !== "" ? (
          <View>
            <View className="mb-5 flex-row items-center justify-between">
              <Text className="text-heading font-extrabold text-ink-strong">
                {place.district
                  ? `${place.sido} ${districtLabel(place.district)}${place.dong ? ` ${place.dong}` : ""}`
                  : place.sido}
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

            {error ? (
              <NoteBox tone="alert" className="mb-4">
                {error}
              </NoteBox>
            ) : null}

            {loading ? (
              <Text className="mt-6 text-center text-body-lg text-ink-sub">
                찾아가실 곳을 알아보고 있어요…
              </Text>
            ) : result === null ? null : (
              <>
                {/* **그 사람이 사는 동의 주민센터를 앞에 둔다.** 구 하나에 스물몇 곳이라
                    순서가 없으면 자기 것을 찾지 못한다 */}
                {result.offices.length > 0 ? (
                  <Section title="주민센터">
                    {sortOffices(result.offices, place)
                      .slice(0, 3)
                      .map((o, i) => (
                        <PlaceCard
                          key={`${o.dong}-${o.name}`}
                          name={o.name}
                          address={o.address}
                          badge={i === 0 && place.dong && o.dong === place.dong ? "여기예요" : undefined}
                        />
                      ))}
                    {/* 신분증 재발급은 어느 주민센터에서나 된다. 자기 동이 아니어도
                        괜찮다는 것을 알려야 가까운 곳으로 간다 (§5.4) */}
                    <NoteLine tone="info">신분증은 어느 주민센터에서나 다시 받으실 수 있어요.</NoteLine>
                  </Section>
                ) : null}

                {/* 공단 기관은 지역이 안 맞아도 온다. 전국에 몇 곳뿐이라 지역으로
                    거르면 사라지고, 그러면 주 경로가 화면에서 없어진다 */}
                {centersFor(result.institutions, place.district).length > 0 ? (
                  <Section title="마음이 힘들 때 가는 곳">
                    {centersFor(result.institutions, place.district).map((x) => (
                      <PlaceCard key={x.name} name={x.name} address={x.address} phone={x.phone} />
                    ))}
                  </Section>
                ) : null}

                {branchesFor(result.institutions, place).length > 0 ? (
                  <Section title="법무보호복지공단">
                    {branchesFor(result.institutions, place).map((x) => (
                      <PlaceCard key={x.name} name={x.name} address={x.address} phone={x.phone} />
                    ))}
                  </Section>
                ) : null}

                {result.offices.length === 0 && result.institutions.length === 0 ? (
                  <NoteBox tone="warn">
                    <NoteLine tone="warn">이 지역에서 찾아가실 곳을 아직 못 찾았어요.</NoteLine>
                    <NoteLine tone="warn" className="mt-1">
                      1670-7004로 전화하시면 알려드려요.
                    </NoteLine>
                  </NoteBox>
                ) : null}
              </>
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* 위치를 쓰지 않기로 한 뒤에도 색을 죽이지 않는다. 다시 시도할 수 있어야 한다. */}
      {state.status === "denied" && place === null ? (
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
