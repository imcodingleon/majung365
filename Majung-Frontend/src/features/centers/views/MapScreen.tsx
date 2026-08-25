// 지도 탭 — 센터 찾기 (§5.4).
//
// **예선 화면을 되살린 것이다.** 기획서 §5.4가 지도를 폐기했으나 2026-08-26에
// 되돌렸다 (`decision-log-2026-08-26.md` B-2). 검색창·갈래 칩·즐겨찾기·전화·길찾기는
// 그때 만든 것을 그대로 쓰고, **데이터가 나오는 곳과 아이콘만 바꿨다.**
//
// 아이콘은 PNG를 되살리지 않고 SVG로 다시 그렸다. 사전 색칠본이라 색을 바꿀 수 없고,
// 앱 전체가 SVG 한 세트로 통일되어 있어 섞으면 굵기와 여백이 어긋나 보인다.
import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/shared/components/Icon";
import { Logo } from "@/shared/components/Logo";
import { useIsDesktop } from "@/shared/hooks/useIsDesktop";
import { RegionPicker } from "@/features/institutions/views/RegionPicker";
import { COLORS } from "@/shared/theme/colors";
import type { Center } from "@/shared/types";

import { useNearbyCenters } from "../hooks/useNearbyCenters";
import { CenterMap } from "./CenterMap";

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
      <Icon name="search" size={20} color={COLORS.inkSub} />
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
        <Pressable
          onPress={() => setFav((f) => !f)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={fav ? "즐겨찾기 해제" : "즐겨찾기에 넣기"}
        >
          <Icon name="star" size={22} color={COLORS.brand} filled={fav} />
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
          <Icon name="phone" size={16} color={COLORS.brand} />
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
          <Icon name="pin" size={16} color={COLORS.surface} />
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

function ListHeading({ error }: { error: string | null }) {
  return (
    <View className="gap-1">
      <Text className="text-xl font-bold text-[#1d1b20]">센터 위치 정보</Text>
      {/* **없는 기관을 있는 것처럼 보여주지 않는다.** 예선은 서버가 안 되면 시연용
          고정 데이터로 넘어갔는데, 그것을 보고 찾아가면 헛걸음이다 */}
      {error ? <Text className="text-xs text-ink-muted">{error}</Text> : null}
    </View>
  );
}

export function MapScreen() {
  const [cat, setCat] = useState<string>("전체");
  const [query, setQuery] = useState("");
  const { centers, loading, error, place, pick } = useNearbyCenters();
  const isDesktop = useIsDesktop();

  const shown = useMemo(() => {
    const byCat = cat === "전체" ? centers : centers.filter((c) => c.category === cat);
    const q = query.trim();
    if (!q) return byCat;
    return byCat.filter((c) => c.name.includes(q) || c.tags.some((t) => t.includes(q)));
  }, [centers, cat, query]);

  // **위치를 못 받으면 지역을 직접 고르게 한다** (§5.4). 위치를 거부하는 것은
  // 이 서비스에서 흔한 선택이고, 거부했다고 화면이 비면 쓸 수 없는 것과 같다.
  if (!place) {
    return (
      <SafeAreaView className="flex-1 bg-page" edges={["top"]}>
        <View className="border-b border-line bg-white px-5 py-4 lg:hidden">
          <Logo height={26} />
        </View>
        <RegionPicker onPick={pick} />
      </SafeAreaView>
    );
  }

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
            <ListHeading error={error} />
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
          <ListHeading error={error} />
          <CenterList loading={loading} shown={shown} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
