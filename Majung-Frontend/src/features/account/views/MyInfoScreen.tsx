// 내 정보 — 열람·수정·삭제 (§2.5·§9.4).
//
// 정보를 저장하는 이상 사용자가 자기 정보를 보고 고치고 지울 수 있어야 한다. 법적 요구사항이다.
// **계정 전체 삭제와 항목별 철회는 다르다.** 죄목 동의를 물리면 죄목만 지운다.
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChoiceButton } from "@/shared/components/ChoiceButton";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { NoteBox } from "@/shared/components/NoteBox";
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
  /** 서버 처리에 실패했을 때. */
  error?: string | null;
  /** 상황 알아보기를 다시 하러 간다 (§3.7). 없으면 그 자리를 만들지 않는다. */
  onRetake?: () => void;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start gap-3 border-b border-line py-4">
      <Text className="w-24 text-body font-bold text-ink-header">{label}</Text>
      <Text className="flex-1 text-body-lg text-ink-strong">{value}</Text>
    </View>
  );
}

export function MyInfoScreen({
  profile,
  onChangeCrime,
  onErase,
  onClose,
  onRetake,
  error,
}: Props) {
  const [editingCrime, setEditingCrime] = useState(false);
  const [confirming, setConfirming] = useState<EraseScope | null>(null);

  // **무엇을 고르셨는지는 여기 나오지 않는다** (§2.5 — 화면에 띄우면 어깨 너머로 보인다).
  // 저장되어 있다는 사실과, 바꾸거나 지울 수 있다는 것만 알면 이 화면의 목적은 이룬다.
  const crimeLabel = profile.hasCrime ? "말씀해 주셨어요" : "말하지 않기로 하셨어요";

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
      <ScreenHeader title="내 정보" closeHint="내 정보 화면 닫기" onClose={onClose} />

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-12 pt-4">
        {error ? (
          <NoteBox tone="alert" className="mb-4">
            {error}
          </NoteBox>
        ) : null}

        <View className="rounded-2xl bg-white px-4">
          <Row label="이름" value={profile.name} />
          <Row label="생일" value={formatDate(profile.birth)} />
          <Row label="출소한 날" value={formatDate(profile.releaseDate)} />
          {/* 라벨이 길어 다른 행처럼 옆에 붙이지 않는다. 위아래로 놓아 두 줄로 접히지 않게 한다. */}
          <View className="py-4">
            <Text className="text-body font-bold text-ink-header">어떤 일로 계셨는지</Text>
            <Text className="mt-2 text-body-lg text-ink-strong">{crimeLabel}</Text>
            <Pressable
              onPress={() => setEditingCrime((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="어떤 일로 계셨는지 바꾸기"
              className="mt-3 self-start rounded-lg border border-line px-3 py-2 active:opacity-70"
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
              // **지금 무엇이 골라져 있는지 표시하지 않는다.** 서버가 값을 주지 않으므로
              // 알 수 없고, 짐작해서 표시하면 그것이 곧 틀린 정보가 된다.
              // "말하지 않기로 하셨어요"인 것만은 확실하므로 그때만 표시한다.
              const selected = c.id === "undisclosed" && !profile.hasCrime;
              return (
                <ChoiceButton
                  key={c.id}
                  label={c.label}
                  selected={selected}
                  onPress={() => {
                    onChangeCrime(c.id === "undisclosed" ? null : c.id);
                    setEditingCrime(false);
                  }}
                  className="mb-2"
                />
              );
            })}
          </View>
        ) : null}

        <NoteBox tone="info" className="mt-6">마지막으로 앱을 쓰신 날부터 1년이 지나면 저절로 지워져요.</NoteBox>

        {/* **지우기 앞에 둔다.** 상황이 달라졌을 때 사람들이 먼저 찾는 것이 이 자리인데,
            없으면 계정을 지우고 새로 가입하는 쪽으로 간다 — 되돌릴 수 없는 길이다 */}
        {onRetake ? (
          <>
            <Text className="mb-3 mt-8 text-body-lg font-extrabold text-ink-strong">
              상황이 달라졌나요
            </Text>
            <Pressable
              onPress={onRetake}
              accessibilityRole="button"
              accessibilityLabel="상황 알아보기 다시 하기"
              className="mb-3 rounded-xl border-[1.5px] border-brand-soft bg-white px-4 py-4 active:opacity-80"
            >
              <Text className="text-body-lg font-bold" style={{ color: COLORS.brand }}>
                상황 다시 알아보기
              </Text>
              <Text className="mt-1 text-caption text-ink-muted">
                지금에 맞게 할 일을 다시 골라 드려요. 끝낸 표시는 지워져요.
              </Text>
            </Pressable>
          </>
        ) : null}

        <Text className="mb-3 mt-8 text-body-lg font-extrabold text-ink-strong">정보 지우기</Text>

        {profile.hasCrime ? (
          <Pressable
            onPress={() => setConfirming("crime")}
            accessibilityRole="button"
            accessibilityLabel="어떤 일로 계셨는지 지우기"
            className="mb-3 rounded-xl border-[1.5px] border-line bg-white px-4 py-4 active:opacity-80"
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
