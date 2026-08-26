// 상황 알아보기 다시 하기 (§3.7).
//
// **상황은 바뀐다.** 잘 곳이 생기고 신분증이 나오고 일자리가 정해진다. 처음 답한 것에
// 묶여 있으면 **이미 해결된 일이 계속 할 일로 남고, 새로 생긴 문제는 목록에 들어오지
// 않는다.** 그때 할 수 있는 것이 계정을 지우고 새로 가입하는 것뿐이어서는 안 된다.
//
// **가입 정보는 건드리지 않는다.** 이름·생일·출소날짜·동의는 그대로 두고 분야 답만
// 다시 받는다. 그래서 가입 화면을 재사용하지 않고 이 화면을 따로 둔다 — 다시 하러
// 들어온 사람에게 이름과 생일을 또 묻는 것은 "다시 하기"가 아니다.
//
// **빈 화면에서 시작한다.** 예전 답을 채워 두면 무엇을 고쳐야 하는지 찾아 헤매게 되고,
// 저리터러시 사용자에게 그것은 처음부터 답하는 것보다 어렵다. 서버도 답변을 저장하지
// 않으므로(§9.1) 채울 값 자체가 없다.
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";

import { allSectionsDone } from "@/features/intake/domain/progress";
import { SECTIONS, type SectionId } from "@/features/intake/domain/sections";
import { useIntake } from "@/features/intake/hooks/useIntake";
import { QuestionFlow, SectionGrid } from "@/features/intake";
import { Button } from "@/shared/components/Button";
import { NoteBox } from "@/shared/components/NoteBox";
import { ScreenHeader } from "@/shared/components/ScreenHeader";
import { ApiError, putIntake } from "@/shared/utils/api";
import { getSession, startSession } from "@/shared/utils/session";
import { markAnswers } from "@/shared/utils/storage";
import { loadToken } from "@/shared/utils/tokenStore";

export default function RetakeRoute() {
  const session = getSession();
  const intake = useIntake();
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = allSectionsDone(SECTIONS, intake.progress);
  const openLabel = SECTIONS.find((s) => s.id === openSection)?.label ?? "";

  const submit = useCallback(async () => {
    if (sending || !done) return;
    setSending(true);
    setError(null);
    try {
      const token = await loadToken();
      if (!token) {
        setError("다시 로그인해 주세요.");
        return;
      }
      // 보이지 않는 답은 보내지 않는다 (§3.8). 답을 바꿔 닫힌 꼬리질문의 답은 여기서 빠진다.
      const next = await putIntake(token, intake.toPayload());
      // 답을 바꿨으니 기기에 남은 것도 덮어쓴다. 안 덮으면 옛 답으로 담당자에게
      // 알리게 된다 (§7.4-1).
      markAnswers(intake.answers);
      startSession({
        name: next.name,
        tasks: next.tasks,
        completed: next.completed,
        // **위치는 그대로 이어받는다.** 다시 물어볼 이유가 없고, 서버로 가지 않는
        // 값이라 이 화면을 지나며 잃으면 근처 기관 안내만 비게 된다 (§5.4).
        place: session?.place,
        rawAnswers: intake.answers,
      });
      router.replace("/today");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "지금은 저장하지 못했어요.");
    } finally {
      setSending(false);
    }
  }, [done, intake, sending, session?.place]);

  // 가입하지 않았으면 다시 할 것도 없다.
  if (!session) return <Redirect href="/signup" />;

  return (
    <>
      <SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
        <ScreenHeader
          title="설문조사 다시 진행하기"
          closeHint="설문조사 그만두기"
          onClose={() => router.back()}
        />

        <ScrollView className="flex-1" contentContainerClassName="px-5 pb-12 pt-4">
          <NoteBox tone="info" className="mb-5">
            지금 상황에 맞게 할 일을 다시 골라 드립니다. 이름과 생일은 그대로 있어요.
          </NoteBox>

          {error ? (
            <NoteBox tone="alert" className="mb-4">
              {error}
            </NoteBox>
          ) : null}

          <SectionGrid progress={intake.progress} onOpen={setOpenSection} />

          <View className="mt-8">
            <Button
              label={sending ? "저장하고 있어요…" : "다 골랐어요"}
              onPress={() => void submit()}
              disabled={!done || sending}
            />
            {!done ? (
              <Text className="mt-3 text-center text-caption text-ink-muted">
                여섯 분야를 모두 골라 주세요.
              </Text>
            ) : null}
          </View>

          {/* **되돌릴 수 없는 일이라는 것을 미리 말한다.** 다시 하면 지금까지 끝낸
              표시가 지워진다 — 할 일이 새로 정해지기 때문이다 */}
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="그만두고 돌아가기"
            className="mt-6 items-center py-3 active:opacity-70"
          >
            <Text className="text-body font-bold text-ink-sub">그만두고 돌아가기</Text>
          </Pressable>

          <Text className="mt-2 text-center text-caption text-ink-muted">
            다시 하시면 지금까지 끝낸 표시는 지워져요.
          </Text>
        </ScrollView>
      </SafeAreaView>

      {openSection ? (
        <QuestionFlow
          sectionId={openSection}
          sectionLabel={openLabel}
          questions={intake.questionsFor(openSection)}
          answers={intake.answers}
          onSelectSingle={intake.setSingle}
          onToggleMulti={intake.toggleMulti}
          onClose={() => setOpenSection(null)}
        />
      ) : null}
    </>
  );
}
