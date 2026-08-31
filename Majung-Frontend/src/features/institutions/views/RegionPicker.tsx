// 지역을 직접 고르기 (§5.4-5).
//
// 위치 허가를 거부했거나 위치를 못 잡았을 때 나오는 길이다. 기본 흐름은 아니지만
// **반드시 있어야 한다.** 허가하지 않았다는 이유로 안내를 못 받으면 안 된다.
//
// **위치를 잡는 쪽은 여기서 손대지 않는다.** 자동 감지는 이미 동작하고 있고, 이 화면은
// 그것이 실패했을 때만 나온다 (2026-08-31 사용자 확인).
//
// 2026-08-31에 한 화면에 쌓여 있던 목록을 **단계 전환**으로 바꿨다. 시도를 고르면
// 아래에 시군구가 덧붙던 것이 그 자리를 갈아 끼우는 방식이 되었고, 동 단계가 생겼다.
// 동까지 고르면 그 동의 대표 좌표가 함께 실려 지도가 거리를 잰다 (결정 F-1).
import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Icon } from "@/shared/components/Icon";
import { dongsOf } from "@/shared/location/locate";
import { COLORS } from "@/shared/theme/colors";
import { FONTS } from "@/shared/theme/fonts";

import {
  districtsOf,
  hasMoreThanShown,
  REGIONS,
  type RegionHit,
  searchRegions,
  selectRegion,
  type SelectedRegion,
} from "../domain/region";

type Props = {
  onPick: (region: SelectedRegion) => void;
  /**
   * 고르기를 그만두었을 때 갈 곳.
   *
   * **주는 쪽이 있을 때만 첫 단계에 "이전"이 생긴다.** 지도에서 "지역 변경"을 눌러
   * 들어온 사람은 돌아갈 자리가 있지만, 위치를 못 잡아 이 화면이 처음 뜬 사람에게는
   * 뒤에 아무것도 없다.
   */
  onCancel?: () => void;
  /**
   * 위에 파란 배너를 얹을지 (2026-08-31 시안).
   *
   * **이 화면만으로 한 화면을 이룰 때만 켠다.** 지도 탭이 그렇다. 다른 안내 아래에
   * 끼워 넣는 자리(`NearbyScreen`)에서는 제목이 두 번 나와 어느 것이 이 화면의
   * 제목인지 알 수 없게 된다.
   */
  banner?: boolean;
};

/** 세 단계가 같은 모양을 쓴다. 두 벌로 두면 한쪽만 고치게 된다. */
function RegionButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className="items-center justify-center rounded-lg px-2 py-3 active:opacity-80"
      style={{
        backgroundColor: selected ? COLORS.brandTint : COLORS.surface,
        borderColor: selected ? COLORS.brand : COLORS.inkMuted,
        borderWidth: selected ? 1.5 : 1,
        // 흰 버튼이 흰 바탕 위에 놓이므로 살짝 띄운다 (시안).
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 1,
        elevation: 1,
      }}
    >
      <Text
        style={{
          fontSize: 16,
          lineHeight: 24,
          color: selected ? COLORS.brand : COLORS.inkStrong,
          fontFamily: selected ? FONTS.bold : FONTS.semibold,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * 검색 결과 한 줄.
 *
 * **격자가 아니라 폭 전체를 쓴다.** 세 칸짜리 격자에 "경기 군포시 / 산본1동"은
 * 들어가지 않는다. 상위 지역을 함께 적는 것은 "중앙동"이 전국에 여럿이기 때문이다.
 */
function HitRow({ hit, onPress }: { hit: RegionHit; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hit.parent ? `${hit.parent} ${hit.label}` : hit.label}
      className="justify-center rounded-lg border px-4 py-3 active:opacity-80"
      style={{ minHeight: 56, backgroundColor: COLORS.surface, borderColor: COLORS.inkMuted }}
    >
      {hit.parent ? (
        <Text
          style={{ fontSize: 13, lineHeight: 18, color: COLORS.inkMuted, fontFamily: FONTS.medium }}
        >
          {hit.parent}
        </Text>
      ) : null}
      <Text
        style={{ fontSize: 16, lineHeight: 24, color: COLORS.inkStrong, fontFamily: FONTS.bold }}
      >
        {hit.label}
      </Text>
    </Pressable>
  );
}

/** 안내 두 줄. 하는 말과 해 달라는 말을 한 문장에 섞지 않는다 (copy-voice). */
function Note({ says, asks }: { says: string; asks?: string }) {
  return (
    <View className="pt-6">
      <Text
        style={{ fontSize: 14, lineHeight: 22, color: COLORS.inkMuted, fontFamily: FONTS.medium }}
      >
        {says}
      </Text>
      {asks ? (
        <Text
          style={{ fontSize: 14, lineHeight: 22, color: COLORS.inkMuted, fontFamily: FONTS.medium }}
        >
          {asks}
        </Text>
      ) : null}
    </View>
  );
}

export function RegionPicker({ onPick, onCancel, banner }: Props) {
  const [sido, setSido] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [dong, setDong] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const keyword = query.trim();
  const searching = keyword !== "";

  const dongs = useMemo(() => (sido && district ? dongsOf(sido, district) : []), [sido, district]);

  /**
   * 지금 어느 판을 보여줄지.
   *
   * **상태로 들고 있지 않고 고른 값에서 뽑아낸다.** 따로 들면 단계와 선택이 어긋날 수
   * 있고, 그때 화면은 아무 잘못 없이 엉뚱한 목록을 낸다.
   */
  const step: "sido" | "district" | "dong" =
    sido === null ? "sido" : district === null || dongs.length === 0 ? "district" : "dong";

  const hits = useMemo(() => searchRegions(keyword), [keyword]);
  const trimmed = useMemo(() => hasMoreThanShown(keyword), [keyword]);

  /**
   * 한 단계 위로.
   *
   * **가장 깊은 선택을 지우는 것이 아니라 단계를 되돌린다.** 선택 기준으로 만들면
   * 동이 없는 시군구를 고른 사람의 첫 누름이 화면에 아무 변화도 없는 헛누름이 된다.
   */
  function goBack() {
    setQuery("");
    if (step === "dong") {
      setDistrict(null);
      setDong(null);
      return;
    }
    if (step === "district") {
      setSido(null);
      setDistrict(null);
      setDong(null);
      return;
    }
    onCancel?.();
  }

  /** 검색 결과를 누르면 단계를 건너뛰고 그 자리에 골라진 채로 선다. */
  function jumpTo(hit: RegionHit) {
    setSido(hit.sido);
    setDistrict(hit.district);
    setDong(hit.dong);
    setQuery("");
  }

  const backable = step !== "sido" || onCancel !== undefined;
  const trail = step === "district" ? sido : step === "dong" ? `${sido} ${district}` : null;
  const title = searching
    ? "검색 결과"
    : step === "sido"
      ? "시/도 선택"
      : step === "district"
        ? "시/군/구 선택"
        : "동 선택";

  const ready = sido !== null;

  return (
    <View className="flex-1">
      {banner ? (
        <View
          className="flex-row items-center gap-2 border-b border-line px-5 pb-3 pt-12"
          style={{
            backgroundColor: COLORS.brandTint,
            shadowColor: "#989898",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 5,
            elevation: 3,
          }}
        >
          <View className="flex-1 gap-2">
            <Text
              className="px-1 text-ink-strong"
              style={{ fontSize: 20, lineHeight: 26, fontFamily: FONTS.bold, letterSpacing: -0.5 }}
              accessibilityRole="header"
            >
              지역 선택
            </Text>
            <Text
              className="text-ink-muted"
              style={{ fontSize: 14, lineHeight: 20, fontFamily: FONTS.medium }}
            >
              원하시는 지역을 선택하면{"\n"}해당 지역의 지원 정보와 기관을 안내해 드려요.
            </Text>
          </View>
          {/* 이 화면이 무엇을 하는 곳인지 그림으로도 알린다.
              **`flexShrink: 0`이 없으면 안 된다.** 옆의 설명이 한 줄에 다 들어가지
              않으면 그림 쪽이 눌려 폭이 0이 되고, 자리만 남고 그림이 사라진다 */}
          <Image
            source={require("../../../../assets/images/region-banner.png")}
            style={{ width: 132, height: 88, flexShrink: 0 }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
      ) : null}

      <ScrollView
        className="flex-1 bg-white"
        contentContainerClassName="px-8 py-6"
        keyboardShouldPersistTaps="handled"
      >
        {/* **되돌아갈 길이 보여야 한다.** 안 보이면 앱을 껐다 켠다.
            지금까지 고른 자취를 옆에 두어 어디쯤 왔는지 늘 알린다 */}
        {backable || trail ? (
          <View className="flex-row items-center gap-3 pb-4">
            {backable ? (
              <Pressable
                onPress={goBack}
                accessibilityRole="button"
                accessibilityLabel="이전"
                className="-ml-1 flex-row items-center gap-0.5 py-1 pr-2 active:opacity-70"
              >
                <Icon name="back" size={20} color={COLORS.inkStrong} />
                <Text
                  style={{
                    fontSize: 15,
                    lineHeight: 22,
                    color: COLORS.inkStrong,
                    fontFamily: FONTS.semibold,
                  }}
                >
                  이전
                </Text>
              </Pressable>
            ) : null}
            {trail ? (
              <Text
                className="flex-1"
                numberOfLines={1}
                style={{
                  fontSize: 15,
                  lineHeight: 22,
                  color: COLORS.brand,
                  fontFamily: FONTS.bold,
                }}
              >
                {trail}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* 시·도가 열일곱이고 동은 삼천이 넘는다. 이름을 아는 사람은 적어서 찾는다.
            **어느 단계에 있든 시군구와 동까지 함께 훑는다** — 예전에는 시도만 걸러서
            "군포"를 친 사람에게 빈 화면이 나갔다 */}
        <View
          className="flex-row items-center gap-2.5 rounded-xl border-[1.5px] bg-white px-4 py-2.5"
          style={{ borderColor: COLORS.lineStrong }}
        >
          <Icon name="search" size={24} color={COLORS.inkMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="지역·동 이름을 검색해 보세요"
            placeholderTextColor={COLORS.inkMuted}
            accessibilityLabel="지역명 검색"
            className="flex-1"
            style={{ fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.inkStrong }}
          />
        </View>

        <Text
          className="pt-6 text-ink-strong"
          style={{ fontSize: 16, lineHeight: 36, fontFamily: FONTS.bold, letterSpacing: 0.2 }}
        >
          {title}
        </Text>

        {searching ? (
          <View className="gap-2 pt-3">
            {hits.map((hit) => (
              <HitRow
                key={`${hit.kind}:${hit.sido}:${hit.district ?? ""}:${hit.dong ?? ""}`}
                hit={hit}
                onPress={() => jumpTo(hit)}
              />
            ))}
            {hits.length === 0 ? <Note says="찾으시는 지역이 없습니다." /> : null}
            {trimmed ? <Note says="결과가 많습니다." asks="더 자세히 입력해 주세요." /> : null}
          </View>
        ) : step === "sido" ? (
          /* 네 칸씩 늘어놓는다. 이름이 두 글자라 한 줄에 넷이 들어간다 */
          <View className="flex-row flex-wrap gap-3 pt-3">
            {REGIONS.map((r) => (
              <View key={r.sido} style={{ width: "22%" }}>
                <RegionButton
                  label={r.sido}
                  selected={false}
                  onPress={() => {
                    setSido(r.sido);
                    setDistrict(null);
                    setDong(null);
                  }}
                />
              </View>
            ))}
          </View>
        ) : step === "district" ? (
          /* **시·군·구를 안 골라도 넘어갈 수 있다.** 센터가 없는 지역이 있어서,
             반드시 고르게 하면 막다른 길이 된다 */
          <>
            <View className="flex-row flex-wrap gap-3 pt-3">
              {districtsOf(sido as string).map((d) => (
                <View key={d} style={{ width: "30%" }}>
                  <RegionButton
                    label={d}
                    selected={district === d}
                    onPress={() => {
                      setDistrict(d);
                      setDong(null);
                    }}
                  />
                </View>
              ))}
            </View>
            {district !== null && dongs.length === 0 ? (
              <Note says="이 지역은 동 정보가 없습니다." asks="선택 완료를 눌러 주세요." />
            ) : null}
          </>
        ) : (
          /* 동 이름은 열에 아홉이 서너 글자라 시·군·구와 같은 세 칸에 들어간다.
             **긴 이름을 잘라내지 않는다** — "종로1·2·3·4가동"을 줄이면 어디인지 알 수
             없다. 두 줄로 접히게 두면 같은 줄의 칸들이 함께 높아진다 */
          <View className="flex-row flex-wrap gap-3 pt-3">
            {dongs.map((d) => (
              <View key={d} style={{ width: "30%" }}>
                <RegionButton label={d} selected={dong === d} onPress={() => setDong(d)} />
              </View>
            ))}
          </View>
        )}

        <View className="pt-10">
          <Pressable
            onPress={() => sido && onPick(selectRegion(sido, district, dong))}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
            accessibilityLabel="선택 완료"
            className="items-center justify-center rounded-2xl active:opacity-90"
            style={{ height: 62, backgroundColor: ready ? COLORS.brand : COLORS.brandMuted }}
          >
            <Text
              className="text-white"
              style={{ fontSize: 20, lineHeight: 27, fontFamily: FONTS.extrabold }}
            >
              선택 완료
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
