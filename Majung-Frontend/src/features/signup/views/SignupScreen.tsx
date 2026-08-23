// 가입 화면 (§3.7).
//
// 화면 하나에서 정보 제공이 끝난다. ① 개인정보 → ② 상황 알아보기 6분야 → ③ 동의 순서다.
// 앱을 켜자마자 질문부터 던지지 않는다. 개인정보 입력이 먼저 오고 문항은 그 아래에 놓인다.
//
// 죄목 문항은 ①에 속하며 ②의 6분야 격자와 시각적으로 구분되어야 한다. 섞이면 죄목 동의의
// 별도 동의 성격이 흐려진다 (§3.7).
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "@/shared/components/AppHeader";
import { DateField } from "@/shared/components/DateField";
import { COLORS } from "@/shared/theme/colors";

import { CRIME_CATEGORIES, type ConsentId, type CrimeCategoryId } from "../domain/signup";
import { useSignupForm } from "../hooks/useSignupForm";

import { ConsentPopup } from "./ConsentPopup";
import { ConsentSection } from "./ConsentSection";

type Props = {
  /** 6분야 격자. 라우트가 조립해 넣는다. feature끼리 직접 가져다 쓰지 않는다. */
  sectionBoxes: React.ReactNode;
  /** 6개 분야를 모두 마쳤는지 (§3.7). */
  intakeDone: boolean;
  /** 상시 도움 연결 (§5.3). 가입 도중에 막혀도 전화할 곳이 있어야 한다. */
  onOpenHelp: () => void;
  /** 가입 완료. 인사말에 쓸 이름을 함께 넘긴다 (§2.5-1). */
  onSubmit: (name: string) => void;
};

/** 생일로 고를 수 있는 범위. 위쪽은 오늘이 든 해까지다. */
const BIRTH_MIN_YEAR = 1930;
/** 생일 목록이 서서 시작하는 해. 이용자 연령대의 가운데쯤이라 대개 몇 번만 굴리면 닿는다. */
const BIRTH_DEFAULT_YEAR = 1975;
/** 출소일 범위. 곧 나올 사람이 시설 안에서 쓰는 것을 전제하므로 내년까지 열어 둔다 (A 프레임). */
const RELEASE_SPAN_YEARS = 5;

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <Text className="mb-2 mt-6 text-body-lg font-extrabold text-ink-strong">
      {children}
      {optional ? (
        <Text className="text-caption font-semibold text-ink-muted"> (안 고르셔도 돼요)</Text>
      ) : null}
    </Text>
  );
}

function CrimeOption({
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
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
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
        {label}
      </Text>
    </Pressable>
  );
}

export function SignupScreen({ sectionBoxes, intakeDone, onOpenHelp, onSubmit }: Props) {
  const form = useSignupForm();
  const [detailId, setDetailId] = useState<ConsentId | null>(null);

  // 6개 분야를 모두 마쳐야 가입이 완료된다 (§3.7 · §13 startApp).
  const canSubmit = form.personalReady && form.consentReady && intakeDone;

  const thisYear = new Date().getFullYear();

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top"]}>
      <AppHeader
        actionLabel="도움이 필요해요"
        actionHint="도움이 필요해요. 전화 상담 번호를 봐요"
        onAction={onOpenHelp}
      />

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-16 pt-6">
        <Text className="text-display font-extrabold text-ink-strong">
          몇 가지만{"\n"}알려주시겠어요?
        </Text>

        {/* ① 개인정보 */}
        <FieldLabel>이름</FieldLabel>
        <TextInput
          className="rounded-xl border-[1.5px] border-line bg-white px-4 py-3.5 text-body-lg text-ink-strong"
          value={form.name}
          onChangeText={form.setName}
          placeholder="이름을 적어 주세요"
          placeholderTextColor={COLORS.inkMuted}
          accessibilityLabel="이름"
        />

        <FieldLabel>생일</FieldLabel>
        <DateField
          value={form.birth}
          onChange={form.setBirth}
          label="생일"
          minYear={BIRTH_MIN_YEAR}
          maxYear={thisYear}
          defaultYear={BIRTH_DEFAULT_YEAR}
        />

        <FieldLabel>출소한 날</FieldLabel>
        <DateField
          value={form.releaseDate}
          onChange={form.setReleaseDate}
          label="출소한 날"
          minYear={thisYear - RELEASE_SPAN_YEARS}
          maxYear={thisYear + 1}
          defaultYear={thisYear}
        />

        {/* "말하고 싶지 않아요"도 다른 선택지와 같은 간격으로 놓는다. 구분선으로 떼어 놓으면
            고르지 않는 편이 낫다는 뜻으로 읽힌다. 말하지 않는 것도 똑같은 선택이다 (§3.3). */}
        <FieldLabel optional>어떤 일로 계셨나요</FieldLabel>
        <View>
          {CRIME_CATEGORIES.map((c) => (
            <CrimeOption
              key={c.id}
              label={c.label}
              selected={form.crime === c.id}
              onPress={() => form.selectCrime(c.id as CrimeCategoryId)}
            />
          ))}
        </View>

        {/* ② 상황 알아보기 — 죄목 문항과 시각적으로 갈라 놓는다 */}
        <View className="my-8 border-t border-line pt-8">{sectionBoxes}</View>

        {/* ③ 동의 */}
        <ConsentSection
          crime={form.crime}
          state={form.consent}
          onToggle={form.toggleConsent}
          onToggleAll={form.toggleAllConsent}
          onOpenDetail={setDetailId}
        />

        {!intakeDone ? (
          <Text className="mt-4 text-center text-caption text-ink-muted">
            6개 분야를 모두 마치면 시작할 수 있어요.
          </Text>
        ) : null}

        <Pressable
          onPress={() => onSubmit(form.name.trim())}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          accessibilityLabel="시작하기"
          className="mt-4 items-center rounded-2xl py-4 active:opacity-90"
          style={{ backgroundColor: canSubmit ? COLORS.brand : COLORS.brandMuted }}
        >
          <Text className="text-body-lg font-extrabold text-white">시작하기</Text>
        </Pressable>
      </ScrollView>

      <ConsentPopup consentId={detailId} onClose={() => setDetailId(null)} />
    </SafeAreaView>
  );
}
