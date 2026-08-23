// 가입 화면 (§3.7). 개편 후 첫 진입 경로가 된다.
//
// 가입 화면·6분야 격자·문항 팝업·도움 연결을 조립하는 자리다.
// 화면이 다른 feature를 직접 가져다 쓰지 않는다.
import { useCallback, useState } from "react";
import { Modal } from "react-native";
import { router } from "expo-router";

import { HelpScreen } from "@/features/help";
import { allSectionsDone } from "@/features/intake/domain/progress";
import { SECTIONS, type SectionId } from "@/features/intake/domain/sections";
import { useIntake } from "@/features/intake/hooks/useIntake";
import { QuestionFlow, SectionGrid } from "@/features/intake";
import { SignupScreen } from "@/features/signup";
import { startSession } from "@/shared/utils/session";

export default function SignupRoute() {
  const intake = useIntake();
  // 문항 팝업이 열려 있는 분야. 닫혀 있으면 null이다.
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const closeSection = useCallback(() => setOpenSection(null), []);

  const openLabel = SECTIONS.find((s) => s.id === openSection)?.label ?? "";

  return (
    <>
      <SignupScreen
        sectionBoxes={<SectionGrid progress={intake.progress} onOpen={setOpenSection} />}
        intakeDone={allSectionsDone(SECTIONS, intake.progress)}
        onOpenHelp={() => setHelpOpen(true)}
        onSubmit={(name) => {
          // 보이지 않는 답은 보내지 않는다 (§3.8). 답을 바꿔 닫힌 꼬리질문의 답은 여기서 빠진다.
          // 개인정보라 로그에 남기지 않는다.
          startSession({ answers: intake.toPayload(), name });
          router.replace("/today");
        }}
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
