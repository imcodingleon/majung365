// 지도 - 센터 찾기 (CAP-5). Figma 2:2464. Maps 키 도착 전까지 지도 영역은 폴백.
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Logo } from "@/shared/components/Logo";
import { useIsDesktop } from "@/shared/hooks/useIsDesktop";
import type { Center } from "@/shared/types";

import { useCenters } from "../hooks/useCenters";
import { CenterMap } from "./CenterMap";

// Figma 원본 아이콘(2:2464) — 배경 투명 색칠본. 이모지 대체.
const MAP_ICONS = {
  search: require("../../../../assets/images/map/search_c.png"),
  phone: require("../../../../assets/images/map/phone_c.png"),
  directions: require("../../../../assets/images/map/directions_c.png"),
  starOn: require("../../../../assets/images/map/star_on.png"),
  starOff: require("../../../../assets/images/map/star_off.png"),
};

const CATEGORIES = ["전체", "법무보호공단", "주민센터", "고용센터"] as const;

function SearchBar({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  return (
    <View className="flex-row items-center gap-3 rounded-full border-2 border-brand bg-white px-6 py-3">
      <TextInput
        className="min-w-0 flex-1 text-base text-ink"
        placeholder="찾으려는 센터를 검색하세요"
        placeholderTextColor="#b4b4b4"
        value={value}
        onChangeText={onChange}
        returnKeyType="search"
      />
      <Image source={MAP_ICONS.search} style={{ width: 20, height: 20 }} contentFit="contain" />
    </View>
  );
}

function FilterChips({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (c: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="grow-0"
      contentContainerClassName="items-center gap-2.5"
    >
      {CATEGORIES.map((c) => {
        const active = c === selected;
        return (
          <Pressable
            key={c}
            className={`rounded-full border px-4 py-2 active:opacity-80 ${
              active ? "border-brand bg-brand" : "border-[#b4b4b4] bg-white"
            }`}
            onPress={() => onSelect(c)}
          >
            <Text className={`text-base ${active ? "text-white" : "text-black"}`}>{c}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function CenterTag({ label, primary }: { label: string; primary: boolean }) {
  return (
    <View className={`rounded-md px-2 py-0.5 ${primary ? "bg-brand-soft" : "bg-[#e5e5e5]"}`}>
      <Text className={`text-xs ${primary ? "text-brand" : "text-black"}`}>{label}</Text>
    </View>
  );
}

function CenterCard({ center }: { center: Center }) {
  const [fav, setFav] = useState(false);
  return (
    <View className="gap-2 rounded-2xl border border-line bg-white p-4 shadow">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-1">
          <Text className="text-base font-semibold text-[#1d1b20]">{center.name}</Text>
          <Text className="text-sm text-[#494551]">운영시간 {center.hours}</Text>
        </View>
        <Pressable onPress={() => setFav((f) => !f)} hitSlop={8}>
          <Image
            source={fav ? MAP_ICONS.starOn : MAP_ICONS.starOff}
            style={{ width: 22, height: 22 }}
            contentFit="contain"
          />
        </Pressable>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {center.tags.map((t, i) => (
          <CenterTag key={t} label={t} primary={i === 0} />
        ))}
      </View>

      <View className="flex-row gap-3 pt-2">
        <Pressable
          className="flex-1 flex-row items-center justify-center gap-1 rounded-xl border border-brand py-3 active:opacity-80"
          onPress={() => Linking.openURL(`tel:${center.phone}`)}
        >
          <Image source={MAP_ICONS.phone} style={{ width: 15, height: 15 }} contentFit="contain" />
          <Text className="text-sm font-medium text-brand">전화</Text>
        </Pressable>
        <Pressable
          className="flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-brand py-3 active:opacity-80"
          onPress={() =>
            Linking.openURL(
              `https://www.google.com/maps/search/?api=1&query=${center.lat},${center.lng}`,
            )
          }
        >
          <Image source={MAP_ICONS.directions} style={{ width: 15, height: 15 }} contentFit="contain" />
          <Text className="text-sm font-medium text-white">길찾기</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CenterList({
  loading,
  shown,
}: {
  loading: boolean;
  shown: Center[];
}) {
  return (
    <View className="gap-4">
      {loading ? (
        <Text className="text-sm text-ink-muted">불러오는 중…</Text>
      ) : shown.length === 0 ? (
        <Text className="text-sm text-ink-muted">조건에 맞는 센터가 없어요.</Text>
      ) : (
        shown.map((c) => <CenterCard key={c.id} center={c} />)
      )}
    </View>
  );
}

function ListHeading({ usingFallback }: { usingFallback: boolean }) {
  return (
    <View className="gap-1">
      <Text className="text-xl font-bold text-[#1d1b20]">센터 위치 정보</Text>
      {usingFallback ? (
        <Text className="text-xs text-ink-muted">실시간 연결이 어려워 예시 정보를 보여드려요.</Text>
      ) : null}
    </View>
  );
}

export function MapScreen() {
  const [cat, setCat] = useState<string>("전체");
  const [query, setQuery] = useState("");
  const { centers, loading, usingFallback } = useCenters(cat === "전체" ? null : cat);
  const isDesktop = useIsDesktop();

  const shown = useMemo(() => {
    const q = query.trim();
    if (!q) return centers;
    return centers.filter((c) => c.name.includes(q) || c.tags.some((t) => t.includes(q)));
  }, [centers, query]);

  return (
    <SafeAreaView className="flex-1 overflow-hidden bg-page" edges={["top"]}>
      {/* 모바일 헤더 — 데스크톱에선 셸 navbar가 대체 */}
      <View className="border-b border-line bg-white px-5 py-4 lg:hidden">
        <Logo height={26} />
      </View>

      {isDesktop ? (
        // 데스크톱 2열 (majung365_web_v2 .map-layout): 좌=검색·칩·지도(유동) / 우=리스트 340px 자체 스크롤
        <View className="w-full max-w-[860px] flex-1 flex-row gap-5 self-center px-4 py-6">
          <View className="flex-1 gap-5">
            <SearchBar value={query} onChange={setQuery} />
            <FilterChips selected={cat} onSelect={setCat} />
            <CenterMap centers={shown} />
          </View>
          <View className="w-[340px] gap-3">
            <ListHeading usingFallback={usingFallback} />
            <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-6 pr-1">
              <CenterList loading={loading} shown={shown} />
            </ScrollView>
          </View>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="gap-5 px-4 pb-10 pt-5">
          <SearchBar value={query} onChange={setQuery} />
          <FilterChips selected={cat} onSelect={setCat} />
          <CenterMap centers={shown} />
          <ListHeading usingFallback={usingFallback} />
          <CenterList loading={loading} shown={shown} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
