// 지역을 직접 고르기 (§5.4-5).
//
// 위치 허가를 거부한 사용자를 위한 길이다. 기본 흐름은 아니지만 **반드시 있어야 한다.**
// 허가하지 않았다는 이유로 안내를 못 받으면 안 된다.
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";

import { districtsOf, REGIONS, type SelectedRegion } from "../domain/region";

type Props = {
  onPick: (region: SelectedRegion) => void;
};

function Chip({
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
      className="rounded-xl border-[1.5px] px-4 py-3 active:opacity-80"
      style={{
        backgroundColor: selected ? COLORS.brandSoft : COLORS.surface,
        borderColor: selected ? COLORS.brand : COLORS.line,
      }}
    >
      <Text
        className="text-body"
        style={{
          color: selected ? COLORS.brand : COLORS.inkStrong,
          fontWeight: selected ? "800" : "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function RegionPicker({ onPick }: Props) {
  const [sido, setSido] = useState<string | null>(null);
  const districts = sido ? districtsOf(sido) : [];

  return (
    <View>
      <Text className="mb-3 text-body-lg font-extrabold text-ink-strong">어디에 계세요?</Text>
      <View className="mb-6 flex-row flex-wrap gap-2">
        {REGIONS.map((r) => (
          <Chip
            key={r.sido}
            label={r.sido}
            selected={sido === r.sido}
            onPress={() => setSido(r.sido === sido ? null : r.sido)}
          />
        ))}
      </View>

      {sido ? (
        <>
          <Text className="mb-3 text-body-lg font-extrabold text-ink-strong">
            {sido} 어디에 계세요?
          </Text>
          <ScrollView className="max-h-80" contentContainerClassName="flex-row flex-wrap gap-2">
            {districts.map((d) => (
              <Chip key={d} label={d} selected={false} onPress={() => onPick({ sido, district: d })} />
            ))}
            {/* 센터가 없는 지역이 있다. 고를 것이 없으면 막다른 길이 된다. */}
            <Chip
              label="여기 없어요"
              selected={false}
              onPress={() => onPick({ sido, district: null })}
            />
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}
