// 가입 화면 (§3.7).
//
// 화면 하나에서 정보 제공이 끝난다. ① 개인정보 → ② 상황 알아보기 6분야 → ③ 동의 순서다.
// 앱을 켜자마자 질문부터 던지지 않는다. 개인정보 입력이 먼저 오고 문항은 그 아래에 놓인다.
//
// 죄목 문항은 ①에 속하며 ②의 6분야 격자와 시각적으로 구분되어야 한다. 섞이면 죄목 동의의
// 별도 동의 성격이 흐려진다 (§3.7).
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "@/shared/components/AppHeader";
import { DateField } from "@/shared/components/DateField";
import { Button } from "@/shared/components/Button";
import { NoteBox } from "@/shared/components/NoteBox";
import { ChoiceButton } from "@/shared/components/ChoiceButton";
import { COLORS } from "@/shared/theme/colors";

import { districtLabel, type LocatedPlace } from "@/shared/location";
import { useRegionLookup } from "@/shared/location";

import {
  CRIME_CATEGORIES,
  type ConsentId,
  type ConsentState,
  type CrimeCategoryId,
  type DateParts,
} from "../domain/signup";
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
  /**
   * 가입 완료. 화면이 모은 값을 그대로 넘기고 **서버 호출은 라우트가 한다.**
   * 화면은 렌더만 한다는 규약 때문이다.
   */
  onSubmit: (input: {
    name: string;
    birth: DateParts;
    releaseDate: DateParts;
    crime: CrimeCategoryId | null;
    consent: ConsentState;
    /**
     * 위치 동의를 켜고 실제로 알아낸 곳. 동의하지 않았거나 못 알아냈으면 없다.
     *
     * **서버로 가지 않는다.** 라우트가 세션에만 담고, 할 일 카드가 근처 기관을
     * 짚을 때 쓴다 (§5.4).
     */
    place?: LocatedPlace;
  }) => void;
  /** 서버에 보내는 중. 두 번 누르는 것을 막는다. */
  submitting?: boolean;
  /** 가입에 실패했을 때 서버가 준 문구. */
  error?: string | null;
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

export function SignupScreen({
  sectionBoxes,
  intakeDone,
  onOpenHelp,
  onSubmit,
  submitting,
  error,
}: Props) {
  const form = useSignupForm();
  const [detailId, setDetailId] = useState<ConsentId | null>(null);
  const lookup = useRegionLookup();

  // 위치 동의를 켜면 그 자리에서 기기 위치를 묻는다. 나중에 따로 물으면 사용자는
  // 자기가 무엇에 동의했는지와 지금 뜬 팝업을 잇지 못한다.
  // 아래 둘도 `form` 전체가 아니라 쓰는 것만 의존성에 넣는다. 훅이 매 렌더마다
  // 새 객체를 돌려주므로 `form`을 넣으면 콜백이 매번 새로 만들어진다.
  const { toggleConsent: setConsent, toggleAllConsent: setAllConsent } = form;
  const locationOn = form.consent.location;
  const locate = lookup.locate;

  const toggleConsent = useCallback(
    (id: ConsentId) => {
      if (id === "location" && !locationOn) void locate();
      setConsent(id);
    },
    [locationOn, locate, setConsent],
  );

  const toggleAllConsent = useCallback(
    (next: boolean) => {
      if (next && !locationOn) void locate();
      setAllConsent(next);
    },
    [locationOn, locate, setAllConsent],
  );

  // **기기가 거부하면 체크도 푼다.** 켜져 있는데 위치가 안 잡히는 상태로 두면
  // 사용자는 나중에 왜 근처 기관이 안 나오는지 알 길이 없다.
  //
  // **의존성에 `form`을 넣지 않는다.** 훅이 매 렌더마다 새 객체를 돌려주므로
  // 넣으면 효과가 끝없이 다시 돌고 화면이 멈춘다(실제로 "Maximum update depth
  // exceeded"가 났다). 여기서 쓰는 것은 `clearLocationConsent` 하나뿐이고
  // 그것은 useCallback으로 고정되어 있다.
  const clearLocationConsent = form.clearLocationConsent;
  useEffect(() => {
    if (lookup.state.status === "denied" || lookup.state.status === "failed") {
      clearLocationConsent();
    }
  }, [lookup.state.status, clearLocationConsent]);

  const located = lookup.state.status === "resolved" ? lookup.state.place : null;
  const locationNote =
    lookup.state.status === "locating"
      ? "지금 계신 곳을 알아보고 있어요…"
      : lookup.state.status === "denied"
        ? "위치를 쓰지 못했어요. 나중에 지역을 직접 고르실 수 있어요."
        : lookup.state.status === "failed"
          ? lookup.state.reason
          : located
            ? `${located.sido} ${districtLabel(located.district)} ${located.dong}`
            : null;

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
          className="rounded-xl border-[1.5px] border-line bg-white px-4 py-4 text-body-lg text-ink-strong"
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
            <ChoiceButton
              key={c.id}
              label={c.label}
              selected={form.crime === c.id}
              onPress={() => form.selectCrime(c.id as CrimeCategoryId)}
              className="mb-2"
            />
          ))}
        </View>

        {/* ② 상황 알아보기 — 죄목 문항과 시각적으로 갈라 놓는다 */}
        <View className="my-8 border-t border-line pt-8">{sectionBoxes}</View>

        {/* ③ 동의 */}
        <ConsentSection
          crime={form.crime}
          state={form.consent}
          onToggle={toggleConsent}
          onToggleAll={toggleAllConsent}
          onOpenDetail={setDetailId}
          locationNote={locationNote}
        />

        {!intakeDone ? (
          <Text className="mt-4 text-center text-caption text-ink-muted">
            6개 분야를 모두 마치면 시작할 수 있어요.
          </Text>
        ) : null}

        {error ? (
          <NoteBox tone="alert" className="mt-4">
            {error}
          </NoteBox>
        ) : null}

        <Button
          label={submitting ? "저장하는 중이에요" : "시작하기"}
          onPress={() =>
            onSubmit({
              name: form.name,
              birth: form.birth,
              releaseDate: form.releaseDate,
              crime: form.crime,
              consent: form.consent,
              place: form.consent.location && located ? located : undefined,
            })
          }
          disabled={!canSubmit || submitting}
          className="mt-4"
        />
      </ScrollView>

      <ConsentPopup consentId={detailId} onClose={() => setDetailId(null)} />
    </SafeAreaView>
  );
}
