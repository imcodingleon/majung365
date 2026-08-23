// 가입 화면 (§3.7). 개편 후 첫 진입 경로가 된다.
// 예선 온보딩 스택이 남아 있는 동안의 임시 경로다.
//
// 가입 화면과 6분야 박스를 조립하는 자리다. 화면이 다른 feature를 직접 가져다 쓰지 않는다.
import { useCallback, useState } from "react";
import { router } from "expo-router";

import { allSectionsDone } from "@/features/intake/domain/progress";
import { SECTIONS, type SectionId } from "@/features/intake/domain/sections";
import { useIntake } from "@/features/intake/hooks/useIntake";
import { QuestionList, SectionBoxes } from "@/features/intake";
import { SignupScreen } from "@/features/signup";
import { startSession } from "@/shared/utils/session";

export default function SignupRoute() {
  const intake = useIntake();
  const [openSection, setOpenSection] = useState<SectionId | null>(null);

  // 한 번에 하나만 펼친다. 같은 박스를 다시 누르면 접힌다.
  const toggleSection = useCallback((id: SectionId) => {
    setOpenSection((prev) => (prev === id ? null : id));
  }, []);

  return (
    <SignupScreen
      sectionBoxes={
        <SectionBoxes
          progress={intake.progress}
          openId={openSection}
          onToggle={toggleSection}
          renderQuestions={(sectionId) => (
            <QuestionList
              questions={intake.questionsFor(sectionId)}
              answers={intake.answers}
              onSelectSingle={intake.setSingle}
              onToggleMulti={intake.toggleMulti}
            />
          )}
        />
      }
      intakeDone={allSectionsDone(SECTIONS, intake.progress)}
      onSubmit={(name) => {
        // 보이지 않는 답은 보내지 않는다 (§3.8). 답을 바꿔 닫힌 꼬리질문의 답은 여기서 빠진다.
        // 개인정보라 로그에 남기지 않는다.
        startSession({ answers: intake.toPayload(), name });
        router.replace("/today");
      }}
    />
  );
}
