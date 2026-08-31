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
import { districtLabel } from "@/shared/location";
import { FONTS } from "@/shared/theme/fonts";
import { Logo } from "@/shared/components/Logo";
import { RegionPicker } from "@/features/institutions/views/RegionPicker";
import { COLORS } from "@/shared/theme/colors";
import type { Center } from "@/shared/types";

import { distanceLabel, groupByCategory, type Origin } from "../domain/grouping";
import { useNearbyCenters } from "../hooks/useNearbyCenters";
import { CenterMap } from "./CenterMap";

// **갖고 있는 것과 맞춘다.** "고용센터"가 칩에 있었는데 그 데이터가 없어 누르면 늘
// 비었고, 246곳을 가진 정신건강복지센터는 칩이 없어 "전체"로만 보였다. 심리상담(R8)이
// 안내하는 기관이라 화면에 나와야 한다.
const CATEGORIES = ["전체", "법무보호공단", "주민센터", "정신건강복지센터"] as const;

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
            // **역할을 밝힌다.** 없으면 낭독기가 글자만 읽고 지나가서, 누를 수 있는
            // 것인지 알 수 없다. 지금 무엇이 골라져 있는지도 함께 알린다
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={c}
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

function CenterCard({ center, distance }: { center: Center; distance: string }) {
  const [fav, setFav] = useState(false);
  return (
    <View
      className="gap-2 rounded-2xl border border-line bg-white p-4"
      // **번짐을 시안 값으로 못 박는다** (2026-08-31 · `43:7364`). `shadow` 한 마디에
      // 맡겨 두었더니 번짐이 4px으로 나와, 시안의 2px보다 그림자가 넓게 퍼졌다.
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.35,
        shadowRadius: 2,
        elevation: 2,
      }}
    >
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-base font-semibold text-[#1d1b20]">{center.name}</Text>
            {/* **얼마나 먼지 함께 낸다.** 가까운 순으로 오지만 그것만으로는 지방에서
                50km 떨어진 공단이 "가장 가까운 곳"으로만 보인다. 숫자가 있어야
                전화로 먼저 물어볼지 사용자가 판단한다.
                자리를 모르면(지역을 직접 고른 경우) 아무것도 그리지 않는다 */}
            {distance ? (
              <Text className="text-sm font-bold" style={{ color: COLORS.brand }}>
                {distance}
              </Text>
            ) : null}
          </View>
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
        {/* **어디로 거는 전화인지 함께 읽어준다.** "전화"만으로는 카드가 여럿일 때
            어느 기관 것인지 낭독기 사용자가 알 수 없다 */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${center.name}에 전화`}
          className="flex-1 flex-row items-center justify-center gap-1 rounded-xl border border-brand py-3 active:opacity-80"
          onPress={() => Linking.openURL(`tel:${center.phone}`)}
        >
          <Icon name="phone" size={16} color={COLORS.brand} />
          <Text className="text-sm font-medium text-brand">전화</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${center.name} 길찾기`}
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
  origin,
}: {
  loading: boolean;
  shown: Center[];
  /** 지금 있는 자리. 지역을 직접 골랐으면 없고, 그때는 거리를 내지 않는다. */
  origin: Origin | null;
}) {
  // **갈래별로 묶는다.** 한 줄로 늘어놓으면 공단 지부와 주민센터와 정신건강복지센터가
  // 섞여, 지금 보는 카드가 어느 기관인지 이름을 읽어야만 알 수 있다.
  const groups = useMemo(() => groupByCategory(shown), [shown]);

  if (loading) return <Text className="text-sm text-ink-muted">불러오는 중…</Text>;
  if (groups.length === 0) {
    return <Text className="text-sm text-ink-muted">조건에 맞는 센터가 없어요.</Text>;
  }

  return (
    <View className="gap-6">
      {groups.map((group) => (
        <View key={group.category} className="gap-3">
          <View className="flex-row items-center gap-2">
            <Text className="text-base font-extrabold text-ink-strong">{group.category}</Text>
            <Text className="text-caption text-ink-muted">{group.items.length}곳</Text>
          </View>
          {group.items.map((c) => (
            <CenterCard key={c.id} center={c} distance={distanceLabel(origin, c)} />
          ))}
        </View>
      ))}
    </View>
  );
}

function ListHeading({
  error,
  region,
  onChangeRegion,
}: {
  error: string | null;
  /** 지금 어느 지역을 보고 있는지. 모르면 배지를 만들지 않는다. */
  region: string;
  onChangeRegion: () => void;
}) {
  return (
    <View className="gap-1">
      {/* **어느 지역을 보고 있는지 제목 옆에 붙인다** (2026-08-31 시안). 위치를 잘못
          잡았을 때 목록만 보고는 알 수 없어서, 엉뚱한 동네의 기관에 전화를 건다 */}
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text
            className="shrink-0 text-ink-strong"
            style={{ fontSize: 20, lineHeight: 28, fontFamily: FONTS.bold }}
          >
            센터 위치 정보
          </Text>
          {region ? (
            <View
              className="shrink rounded-full border-[1.5px] px-3 py-1"
              style={{ backgroundColor: COLORS.brandSoft, borderColor: COLORS.brand }}
            >
              <Text
                numberOfLines={1}
                style={{ fontSize: 14, lineHeight: 18, fontFamily: FONTS.semibold, color: COLORS.brand }}
              >
                {region}
              </Text>
            </View>
          ) : null}
        </View>

        {/* 잘못 잡힌 지역을 고칠 길. 없으면 앱을 지웠다 깔거나 위치를 다시 켜는 수밖에 없다 */}
        <Pressable
          onPress={onChangeRegion}
          accessibilityRole="button"
          accessibilityLabel="지역 변경"
          className="shrink-0 flex-row items-center gap-0.5 rounded-lg border-[1.5px] bg-white py-1 pl-3 pr-1 active:opacity-80"
          style={{ borderColor: COLORS.brand }}
        >
          <Text
            style={{ fontSize: 14, lineHeight: 20, fontFamily: FONTS.semibold, color: COLORS.brand }}
          >
            지역 변경
          </Text>
          <Icon name="next" size={16} color={COLORS.brand} />
        </Pressable>
      </View>

      {/* **없는 기관을 있는 것처럼 보여주지 않는다.** 예선은 서버가 안 되면 시연용
          고정 데이터로 넘어갔는데, 그것을 보고 찾아가면 헛걸음이다 */}
      {error ? <Text className="text-xs text-ink-muted">{error}</Text> : null}
    </View>
  );
}

export function MapScreen() {
  const [cat, setCat] = useState<string>("전체");
  const [query, setQuery] = useState("");
  /**
   * 지역을 다시 고르는 중인가.
   *
   * **저장된 위치를 지우지 않는다.** 가입할 때 알아낸 곳은 다른 화면도 쓰므로, 여기서
   * 비우면 근처 기관 안내까지 함께 사라진다. 이 화면 안에서만 고르는 자리를 다시 낸다.
   */
  const [changing, setChanging] = useState(false);
  const { centers, loading, error, place, pick } = useNearbyCenters();

  /**
   * 거리를 재는 기준. **지역을 직접 고른 사용자에게는 없다** (§5.4).
   *
   * 좌표는 짝으로만 쓴다 — 하나만 있으면 없는 것으로 친다.
   */
  const origin = useMemo<Origin | null>(() => {
    const lat = place?.lat;
    const lng = place?.lng;
    return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
  }, [place]);

  /**
   * 보여줄 기관. **순서를 여기서 다시 매기지 않는다.**
   *
   * 서버가 갈래마다 가까운 순 세 곳씩 잘라 보낸다. 화면이 또 줄을 세우면 같은 규칙이
   * 두 곳에 생기고, 한쪽만 고쳤을 때 목록과 지도가 어긋난다.
   */
  const shown = useMemo(() => {
    const byCat = cat === "전체" ? centers : centers.filter((c) => c.category === cat);
    const q = query.trim();
    if (!q) return byCat;
    return byCat.filter((c) => c.name.includes(q) || c.tags.some((t) => t.includes(q)));
  }, [centers, cat, query]);

  // **위치를 못 받으면 지역을 직접 고르게 한다** (§5.4). 위치를 거부하는 것은
  // 이 서비스에서 흔한 선택이고, 거부했다고 화면이 비면 쓸 수 없는 것과 같다.
  if (!place || changing) {
    return (
      <SafeAreaView className="flex-1 bg-page" edges={["top"]}>
        <View className="border-b border-line bg-white px-5 py-4">
          <Logo height={26} />
        </View>
        <RegionPicker
          onPick={(region) => {
            pick(region);
            setChanging(false);
          }}
          // **처음 뜬 화면에는 돌아갈 자리가 없다.** 위치를 못 잡아 여기로 온 사람에게
          // "이전"을 보여주면 눌러도 아무 데도 가지 못한다.
          onCancel={place ? () => setChanging(false) : undefined}
          banner
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 overflow-hidden bg-page" edges={["top"]}>
      <View className="border-b border-line bg-white px-5 py-4">
        <Logo height={26} />
      </View>

      {/* **한 벌만 둔다** (2026-08-26). 넓은 화면에서 2열로 가는 갈래가 있었는데, 그
          판정이 브라우저 창 너비를 봤다. 웹은 `AppFrame`이 모든 화면을 440px 프레임에
          묶으므로 PC에서는 판정만 켜지고 자리는 없었다 — 오른쪽 칸 340px에 여백과
          간격을 빼면 지도에 48px이 남아, 지도가 세로 띠로 눌렸다.
          창이 아니라 이 화면이 실제로 받는 폭을 봐야 하는데, 그 폭은 늘 440px이다 */}
      <ScrollView className="flex-1" contentContainerClassName="gap-5 px-4 pb-10 pt-5">
        <SearchBar value={query} onChange={setQuery} />
        <FilterChips selected={cat} onSelect={setCat} />
        <CenterMap centers={shown} />
        <ListHeading
          error={error}
          region={
            // **시·도는 뺀다.** 방금 스스로 고른 값이라 헷갈릴 일이 없고, 440px에서
            // "경기 군포시 산본1동"은 "지역 변경" 버튼과 한 줄에 못 들어간다.
            // `districtLabel`을 거치는 것은 자동 감지가 "수원시장안구"를 주기 때문이다.
            place.district
              ? `${districtLabel(place.district)}${place.dong ? ` ${place.dong}` : ""}`
              : place.sido
          }
          onChangeRegion={() => setChanging(true)}
        />
        <CenterList loading={loading} shown={shown} origin={origin} />
      </ScrollView>
    </SafeAreaView>
  );
}
