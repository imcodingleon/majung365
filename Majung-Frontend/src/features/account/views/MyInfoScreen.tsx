// 내 정보 — 열람·수정·삭제 (§2.5·§9.4).
//
// 정보를 저장하는 이상 사용자가 자기 정보를 보고 고치고 지울 수 있어야 한다. 법적 요구사항이다.
// **계정 전체 삭제와 항목별 철회는 다르다.** 죄목 동의를 물리면 죄목만 지운다.
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChoiceButton } from "@/shared/components/ChoiceButton";
import { FramedModal } from "@/shared/components/FramedModal";
import { Icon } from "@/shared/components/Icon";
import { InfoPanel } from "@/shared/components/InfoPanel";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { NoteBox } from "@/shared/components/NoteBox";
import { COLORS } from "@/shared/theme/colors";
import { CRIME_CATEGORIES, type CrimeCategoryId } from "@/shared/types/crime";

import { formatDate, type EraseScope, type StoredProfile } from "../domain/account";

import { EraseCard } from "./EraseCard";

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

/** 구역 제목. 위로 넉넉히 띄워 앞 구역과 갈린다 (2026-08-31 시안). */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="mb-3 mt-8 font-extrabold text-ink-strong"
      style={{ fontSize: 17, lineHeight: 27 }}
      accessibilityRole="header"
    >
      {children}
    </Text>
  );
}

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
  /** 밝히겠다고 고른 값. 동의를 받기 전까지는 보내지 않는다 (§9.5). */
  const [pendingCrime, setPendingCrime] = useState<CrimeCategoryId | null>(null);
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
          <Row label="생년월일" value={formatDate(profile.birth)} />
          <Row label="출소한 날" value={formatDate(profile.releaseDate)} />
          {/* **바꾸기를 오른쪽 끝에 붙인다** (2026-08-31 시안). 아래에 두면 이 행만
              세 줄로 길어져, 위의 세 줄과 같은 표로 읽히지 않는다 */}
          <View className="flex-row items-center gap-3 py-4">
            <Text className="w-24 text-body font-bold text-ink-header">어떤 일로 계셨는지</Text>
            <Text className="flex-1 text-body-lg text-ink-strong">{crimeLabel}</Text>
            <Pressable
              onPress={() => setEditingCrime((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="어떤 일로 계셨는지 바꾸기"
              className="shrink-0 rounded-lg border border-line px-3 py-1 active:opacity-70"
            >
              <Text className="text-caption font-bold text-ink-sub">
                {editingCrime ? "그만두기" : "바꾸기"}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* **민감정보라 따로 받는다** (§3.4-1·§9.5). 가입 화면에서 쓰는 것과 같은 문구다. */}
        {pendingCrime ? (
          <View className="mt-3 rounded-2xl border-[1.5px] border-brand-soft bg-white p-4">
            <Text className="text-body-lg font-extrabold text-ink-strong">
              민감정보 수집·이용 동의
            </Text>
            <Text className="mt-2 text-body text-ink-body">
              어떤 일로 계셨는지 모으고 쓰는 데 동의해요.
            </Text>
            <Text className="mt-2 text-caption text-ink-muted">
              담당자에게는 전해지지 않아요. 언제든 다시 지우실 수 있어요.
            </Text>
            <View className="mt-4 flex-row gap-2">
              <Pressable
                onPress={() => {
                  const picked = pendingCrime;
                  setPendingCrime(null);
                  onChangeCrime(picked);
                }}
                accessibilityRole="button"
                accessibilityLabel="동의하고 저장하기"
                className="rounded-xl px-4 py-3 active:opacity-90"
                style={{ backgroundColor: COLORS.brand }}
              >
                <Text className="text-body font-extrabold text-white">동의하고 저장할게요</Text>
              </Pressable>
              <Pressable
                onPress={() => setPendingCrime(null)}
                accessibilityRole="button"
                accessibilityLabel="그만두기"
                className="rounded-xl border border-line bg-white px-4 py-3 active:opacity-90"
              >
                <Text className="text-body font-semibold text-ink-sub">그만두기</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

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
                    setEditingCrime(false);
                    if (c.id === "undisclosed") {
                      // 지우는 데에는 새 동의가 필요 없다. 철회는 권리다 (§9.5).
                      onChangeCrime(null);
                      return;
                    }
                    // **밝히는 것은 동의를 먼저 받는다.** 가입 때와 같은 규칙이다.
                    setPendingCrime(c.id);
                  }}
                  className="mb-2"
                />
              );
            })}
          </View>
        ) : null}

        <View className="mt-6">
          <InfoPanel title="정보 보관 안내" icon="lock">
            {"마지막으로 이용한 날로부터 1년이 지나면 저장된 정보가\n자동으로 삭제됩니다."}
          </InfoPanel>
        </View>

        {/* **지우기 앞에 둔다.** 상황이 달라졌을 때 사람들이 먼저 찾는 것이 이 자리인데,
            없으면 계정을 지우고 새로 가입하는 쪽으로 간다 — 되돌릴 수 없는 길이다 */}
        {onRetake ? (
          <>
            <SectionHeading>정보 업데이트</SectionHeading>
            <Pressable
              onPress={onRetake}
              accessibilityRole="button"
              accessibilityLabel="설문조사 다시 진행하기"
              className="mb-3 rounded-xl border-[1.5px] bg-white p-4 active:opacity-80"
              style={{ borderColor: COLORS.brandSoft }}
            >
              <View className="flex-row items-center">
                <Text
                  className="flex-1 font-bold"
                  style={{ fontSize: 17, lineHeight: 27, color: COLORS.brand }}
                >
                  설문조사 다시 진행하기
                </Text>
                {/* 눌러서 다른 화면으로 간다는 표시. 글만 있으면 접히는 자리로 읽힌다 */}
                <Icon name="next" size={24} color={COLORS.brand} />
              </View>
              <Text className="mt-1 text-caption text-ink-muted">
                현재 상황에 맞게 설문조사를 다시 진행할 수 있어요.{"\n"}
                다시 진행하면 기존 완료 기록은 초기화됩니다.
              </Text>
            </Pressable>
          </>
        ) : null}

        <SectionHeading>정보 삭제</SectionHeading>

        {profile.hasCrime ? (
          <Pressable
            onPress={() => setConfirming("crime")}
            accessibilityRole="button"
            accessibilityLabel="어떤 일로 계셨는지에 대한 정보 삭제"
            className="mb-3 rounded-xl border-[1.5px] border-line bg-white p-4 active:opacity-80"
          >
            <Text
              className="font-bold text-ink-strong"
              style={{ fontSize: 17, lineHeight: 27 }}
            >
              어떤 일로 계셨는지에 대한 정보 삭제
            </Text>
            <Text className="mt-1 text-caption text-ink-muted">
              해당 정보만 삭제되며, 다른 정보는 그대로 유지됩니다.
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => setConfirming("account")}
          accessibilityRole="button"
          accessibilityLabel="모든 정보 삭제"
          className="rounded-xl border-[1.5px] border-alert-line bg-alert-soft p-4 active:opacity-80"
        >
          <Text className="font-bold text-alert" style={{ fontSize: 17, lineHeight: 27 }}>
            모든 정보 삭제
          </Text>
          <Text className="mt-1 text-caption text-alert-ink">
            저장된 모든 정보와 대화 기록, 할 일 목록이 삭제됩니다.{"\n"}
            삭제한 정보는 복구할 수 없습니다.
          </Text>
        </Pressable>

      </ScrollView>

      {/* **화면을 덮어서 묻는다** (2026-08-31). 전에는 목록 아래에 카드를 펼쳤는데,
          누른 자리가 화면 끝이라 카드가 접힌 곳 밖에 서서 아무 일도 안 난 것처럼
          보였다. 되돌릴 수 없는 일을 묻는 자리가 눈에 안 들어오면 안 된다.
          **카드 양식은 그대로 쓴다** — 생일 확인 화면과 같은 카드라 한쪽만 달라지면
          같은 일을 두 모양으로 묻게 된다 */}
      {confirming ? (
        <FramedModal visible animationType="fade" transparent onRequestClose={() => setConfirming(null)}>
          <View className="flex-1 items-center justify-center bg-black/50 px-6">
            {/* 카드가 화면보다 길어지면 안에서 구른다. 지우는 항목이 늘면 잘린다 */}
            <ScrollView
              className="w-full grow-0"
              contentContainerClassName="py-2"
              showsVerticalScrollIndicator={false}
            >
              <EraseCard
                scope={confirming}
                onErase={() => {
                  const scope = confirming;
                  setConfirming(null);
                  onErase(scope);
                }}
                onCancel={() => setConfirming(null)}
              />
            </ScrollView>
          </View>
        </FramedModal>
      ) : null}
    </SafeAreaView>
  );
}
