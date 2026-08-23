// 내 정보 — 열람·수정·삭제 (§2.5·§9.4).
//
// 정보를 저장하는 이상 사용자가 자기 정보를 보고 고치고 지울 수 있어야 한다. 법적 요구사항이다.
// **계정 전체 삭제와 항목별 철회는 다르다.** 죄목 동의를 물리면 죄목만 지운다.
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { COLORS } from "@/shared/theme/colors";
import { CRIME_CATEGORIES, type CrimeCategoryId } from "@/shared/types/crime";

import {
  eraseConfirmLabel,
  eraseDetail,
  eraseTitle,
  formatDate,
  type EraseScope,
  type StoredProfile,
} from "../domain/account";

type Props = {
  profile: StoredProfile;
  onChangeCrime: (crime: CrimeCategoryId | null) => void;
  onErase: (scope: EraseScope) => void;
  onClose: () => void;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start gap-3 border-b border-line py-4">
      <Text className="w-24 text-body font-bold text-ink-header">{label}</Text>
      <Text className="flex-1 text-body-lg text-ink-strong">{value}</Text>
    </View>
  );
}

export function MyInfoScreen({ profile, onChangeCrime, onErase, onClose }: Props) {
  const [editingCrime, setEditingCrime] = useState(false);
  const [confirming, setConfirming] = useState<EraseScope | null>(null);

  const crimeLabel =
    profile.crime === null
      ? "말하지 않기로 하셨어요"
      : (CRIME_CATEGORIES.find((c) => c.id === profile.crime)?.label ?? "");

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
      <ScreenHeader title="내 정보" closeHint="내 정보 화면 닫기" onClose={onClose} />

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-12 pt-4">
        <View className="rounded-2xl bg-white px-4">
          <Row label="이름" value={profile.name} />
          <Row label="생일" value={formatDate(profile.birth)} />
          <Row label="출소한 날" value={formatDate(profile.releaseDate)} />
          {/* 라벨이 길어 다른 행처럼 옆에 붙이지 않는다. 위아래로 놓아 두 줄로 접히지 않게 한다. */}
          <View className="py-4">
            <Text className="text-body font-bold text-ink-header">어떤 일로 계셨는지</Text>
            <Text className="mt-1.5 text-body-lg text-ink-strong">{crimeLabel}</Text>
            <Pressable
              onPress={() => setEditingCrime((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="어떤 일로 계셨는지 바꾸기"
              className="mt-2.5 self-start rounded-lg border border-line px-3 py-2 active:opacity-70"
            >
              <Text className="text-caption font-bold text-ink-sub">
                {editingCrime ? "그만두기" : "바꾸기"}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* 처음에는 말하고 싶지 않았다가 서비스를 써보고 마음이 바뀔 수 있다 (§3.3-3). */}
        {editingCrime ? (
          <View className="mt-3 rounded-2xl border-[1.5px] border-brand-soft bg-white p-4">
            <Text className="mb-3 text-body text-ink-sub">
              언제든지 바꾸거나 지우실 수 있어요.
            </Text>
            {CRIME_CATEGORIES.map((c) => {
              const selected =
                c.id === "undisclosed" ? profile.crime === null : profile.crime === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    onChangeCrime(c.id === "undisclosed" ? null : c.id);
                    setEditingCrime(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={c.label}
                  className="mb-2 rounded-xl border-[1.5px] px-4 py-3.5 active:opacity-80"
                  style={{
                    backgroundColor: selected ? COLORS.brandSoft : COLORS.surface,
                    borderColor: selected ? COLORS.brand : COLORS.line,
                  }}
                >
                  <Text
                    className="text-body-lg"
                    style={{
                      color: selected ? COLORS.brand : COLORS.inkStrong,
                      fontWeight: selected ? "800" : "600",
                    }}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View className="mt-6 rounded-xl border border-note-info-line bg-note-info px-4 py-3.5">
          <Text className="text-caption text-note-info-ink">
            마지막으로 앱을 쓰신 날부터 1년이 지나면 저절로 지워져요.
          </Text>
        </View>

        <Text className="mb-3 mt-8 text-body-lg font-extrabold text-ink-strong">정보 지우기</Text>

        {profile.crime !== null ? (
          <Pressable
            onPress={() => setConfirming("crime")}
            accessibilityRole="button"
            accessibilityLabel="어떤 일로 계셨는지 지우기"
            className="mb-2.5 rounded-xl border-[1.5px] border-line bg-white px-4 py-4 active:opacity-80"
          >
            <Text className="text-body-lg font-bold text-ink-strong">
              어떤 일로 계셨는지 지우기
            </Text>
            <Text className="mt-1 text-caption text-ink-muted">
              다른 정보는 그대로 있어요.
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => setConfirming("account")}
          accessibilityRole="button"
          accessibilityLabel="모든 정보 지우기"
          className="rounded-xl border-[1.5px] border-alert-line bg-alert-soft px-4 py-4 active:opacity-80"
        >
          <Text className="text-body-lg font-bold text-alert">모든 정보 지우기</Text>
          <Text className="mt-1 text-caption text-alert-ink">
            지우면 되돌릴 수 없어요.
          </Text>
        </Pressable>

        {confirming ? (
          <View className="mt-4 rounded-2xl border-[1.5px] border-alert-line bg-white p-5">
            <Text className="text-body-lg font-extrabold text-alert-ink">
              {eraseTitle(confirming)}
            </Text>
            <View className="mt-3">
              {eraseDetail(confirming).map((line) => (
                <Text key={line} className="mb-1 text-body text-ink-body">
                  · {line}
                </Text>
              ))}
            </View>
            <View className="mt-4 flex-row gap-2">
              <Pressable
                onPress={() => {
                  const scope = confirming;
                  setConfirming(null);
                  onErase(scope);
                }}
                accessibilityRole="button"
                accessibilityLabel={eraseConfirmLabel(confirming)}
                className="rounded-xl bg-alert px-4 py-3 active:opacity-90"
              >
                <Text className="text-body font-extrabold text-white">
                  {eraseConfirmLabel(confirming)}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirming(null)}
                accessibilityRole="button"
                accessibilityLabel="그만두기"
                className="rounded-xl border border-line bg-white px-4 py-3 active:opacity-90"
              >
                <Text className="text-body font-semibold text-ink-sub">그만두기</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
