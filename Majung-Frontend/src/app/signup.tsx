// 가입 화면 (§3.7). 개편 후 첫 진입 경로가 된다.
//
// 가입 화면·6분야 격자·문항 팝업·도움 연결을 조립하는 자리다.
// 화면이 다른 feature를 직접 가져다 쓰지 않는다.
//
// **서버 호출은 여기서 한다.** 화면은 값을 모아 넘기기만 하고 렌더에 집중한다.
import { useCallback, useState } from "react";
import { Modal } from "react-native";
import { router } from "expo-router";

import { HelpScreen } from "@/features/help";
import { allSectionsDone } from "@/features/intake/domain/progress";
import { SECTIONS, type SectionId } from "@/features/intake/domain/sections";
import { useIntake } from "@/features/intake/hooks/useIntake";
import { QuestionFlow, SectionGrid } from "@/features/intake";
import { toSignupRequest } from "@/features/signup/domain/signup";
import { SignupScreen } from "@/features/signup";
import { ApiError, postSignup } from "@/shared/utils/api";
import { startSession } from "@/shared/utils/session";
import { saveToken } from "@/shared/utils/tokenStore";

export default function SignupRoute() {
  const intake = useIntake();
  // 문항 팝업이 열려 있는 분야. 닫혀 있으면 null이다.
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeSection = useCallback(() => setOpenSection(null), []);

  const openLabel = SECTIONS.find((s) => s.id === openSection)?.label ?? "";

  const submit = useCallback(
    async (input: Parameters<React.ComponentProps<typeof SignupScreen>["onSubmit"]>[0]) => {
      if (submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        // 보이지 않는 답은 보내지 않는다 (§3.8). 답을 바꿔 닫힌 꼬리질문의 답은 여기서 빠진다.
        const request = toSignupRequest({ ...input, answers: intake.toPayload() });
        if (!request) {
          setError("적어 주신 내용을 다시 확인해 주세요.");
          return;
        }

        const found = await postSignup(request);
        // **토큰을 먼저 보관한다.** 화면을 옮긴 뒤에 저장하다 실패하면 서버에는 자료가
        // 남았는데 지울 열쇠가 없는 상태가 된다.
        await saveToken(found.session_token);
        // 가입 응답에 할 일이 함께 온다. 홈에서 다시 부르지 않는다.
        startSession({ answers: request.answers, name: request.name, tasks: found.tasks });
        router.replace("/today");
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "지금 연결이 원활하지 않아요. 잠시 후 다시 해 주세요.",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [intake, submitting],
  );

  return (
    <>
      <SignupScreen
        sectionBoxes={<SectionGrid progress={intake.progress} onOpen={setOpenSection} />}
        intakeDone={allSectionsDone(SECTIONS, intake.progress)}
        onOpenHelp={() => setHelpOpen(true)}
        onSubmit={submit}
        submitting={submitting}
        error={error}
      />

      {openSection ? (
        <QuestionFlow
          sectionId={openSection}
          sectionLabel={openLabel}
          questions={intake.questionsFor(openSection)}
          answers={intake.answers}
          onSelectSingle={intake.setSingle}
          onToggleMulti={intake.toggleMulti}
          onClose={closeSection}
        />
      ) : null}

      <Modal
        visible={helpOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setHelpOpen(false)}
      >
        <HelpScreen onClose={() => setHelpOpen(false)} />
      </Modal>
    </>
  );
}
