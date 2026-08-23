// 가입 화면 (§3.7).
//
// 화면 하나에서 정보 제공이 끝난다. ① 개인정보 → ② 상황 알아보기 6분야 박스 → ③ 동의 순서다.
// 앱을 켜자마자 질문부터 던지지 않는다. 개인정보 입력이 먼저 오고 문항은 그 아래에 놓인다.
//
// 죄목 문항은 ①에 속하며 ②의 6분야 박스와 시각적으로 구분되어야 한다. 섞이면 죄목 동의의
// 별도 동의 성격이 흐려진다 (§3.7).
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "@/shared/theme/colors";

import {
  CRIME_CATEGORIES,
  CRIME_OPTIONAL_NOTE,
  STORAGE_NOTICE,
  type ConsentId,
  type CrimeCategoryId,
  type DateParts,
} from "../domain/signup";
import { useSignupForm } from "../hooks/useSignupForm";

import { ConsentPopup } from "./ConsentPopup";
import { ConsentSection } from "./ConsentSection";

type Props = {
  /** 6분야 박스. 라우트가 조립해 넣는다. feature끼리 직접 가져다 쓰지 않는다. */
  sectionBoxes: React.ReactNode;
  /** 6개 분야를 모두 마쳤는지 (§3.7). */
  intakeDone: boolean;
  onSubmit: () => void;
};

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <Text className="mb-2 mt-5 text-base font-extrabold text-ink-strong">
      {children}
      {optional ? <Text className="text-sm font-semibold text-ink-muted"> (안 고르셔도 돼요)</Text> : null}
    </Text>
  );
}

/** 년·월·일을 따로 받는다. 저리터러시 사용자에게 한 칸짜리 날짜 입력은 부담이 크다. */
function DateInput({
  value,
  onChange,
  label,
}: {
  value: DateParts;
  onChange: (next: DateParts) => void;
  label: string;
}) {
  const box =
    "rounded-xl border-[1.5px] border-line bg-white px-3 py-3.5 text-center text-[17px] text-ink-strong";
  return (
    <View className="flex-row items-center gap-2">
      <TextInput
        className={`${box} w-24`}
        value={value.year}
        onChangeText={(t) => onChange({ ...value, year: t.replace(/\D/g, "").slice(0, 4) })}
        keyboardType="number-pad"
        placeholder="1980"
        placeholderTextColor={COLORS.inkMuted}
        accessibilityLabel={`${label} 년`}
      />
      <Text className="text-base text-ink-sub">년</Text>
      <TextInput
        className={`${box} w-16`}
        value={value.month}
        onChangeText={(t) => onChange({ ...value, month: t.replace(/\D/g, "").slice(0, 2) })}
        keyboardType="number-pad"
        placeholder="3"
        placeholderTextColor={COLORS.inkMuted}
        accessibilityLabel={`${label} 월`}
      />
      <Text className="text-base text-ink-sub">월</Text>
      <TextInput
        className={`${box} w-16`}
        value={value.day}
        onChangeText={(t) => onChange({ ...value, day: t.replace(/\D/g, "").slice(0, 2) })}
        keyboardType="number-pad"
        placeholder="15"
        placeholderTextColor={COLORS.inkMuted}
        accessibilityLabel={`${label} 일`}
      />
      <Text className="text-base text-ink-sub">일</Text>
    </View>
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
        className="text-base"
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

export function SignupScreen({ sectionBoxes, intakeDone, onSubmit }: Props) {
  const form = useSignupForm();
  const [detailId, setDetailId] = useState<ConsentId | null>(null);

  // 6개 분야를 모두 마쳐야 가입이 완료된다 (§3.7 · §13 startApp).
  const canSubmit = form.personalReady && form.consentReady && intakeDone;

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top"]}>
      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-16 pt-6">
        <Text className="text-[25px] font-extrabold leading-[35px] text-ink-strong">
          몇 가지만{"\n"}알려주시겠어요?
        </Text>

        {/* ① 개인정보 */}
        <FieldLabel>이름</FieldLabel>
        <TextInput
          className="rounded-xl border-[1.5px] border-line bg-white px-4 py-3.5 text-[17px] text-ink-strong"
          value={form.name}
          onChangeText={form.setName}
          placeholder="이름을 적어 주세요"
          placeholderTextColor={COLORS.inkMuted}
          accessibilityLabel="이름"
        />

        <FieldLabel>생일</FieldLabel>
        <DateInput value={form.birth} onChange={form.setBirth} label="생일" />

        <FieldLabel>출소한 날</FieldLabel>
        <DateInput value={form.releaseDate} onChange={form.setReleaseDate} label="출소한 날" />

        <FieldLabel optional>어떤 일로 계셨나요</FieldLabel>
        <View>
          {CRIME_CATEGORIES.map((c) => (
            <View key={c.id}>
              {/* "말하고 싶지 않아요"는 성격이 다른 선택지다. 구분선으로 확실히 떼어 놓는다 (§3.3). */}
              {c.id === "undisclosed" ? <View className="my-3 border-t border-line" /> : null}
              <CrimeOption
                label={c.label}
                selected={form.crime === c.id}
                onPress={() => form.selectCrime(c.id as CrimeCategoryId)}
              />
            </View>
          ))}
        </View>
        <Text className="mt-1 text-sm leading-[23px] text-ink-muted">{CRIME_OPTIONAL_NOTE}</Text>

        {/* 고지 내용과 실제 처리가 다르면 신뢰 자체가 무너진다 (§3.5). */}
        <View className="mt-6 rounded-xl border border-note-info-line bg-note-info px-4 py-3.5">
          <Text className="text-sm leading-[24px] text-note-info-ink">🔒 {STORAGE_NOTICE}</Text>
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
          <Text className="mt-4 text-center text-sm leading-[23px] text-ink-muted">
            6개 분야를 모두 마치면 시작할 수 있어요.
          </Text>
        ) : null}

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          accessibilityLabel="시작하기"
          className="mt-4 items-center rounded-2xl py-4 active:opacity-90"
          style={{ backgroundColor: canSubmit ? COLORS.brand : COLORS.brandMuted }}
        >
          <Text className="text-[17px] font-extrabold text-white">시작하기</Text>
        </Pressable>
      </ScrollView>

      <ConsentPopup consentId={detailId} onClose={() => setDetailId(null)} />
    </SafeAreaView>
  );
}
