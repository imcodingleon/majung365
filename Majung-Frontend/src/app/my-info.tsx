// 개인정보 열람·수정·삭제 (§2.5·§9.4). 법적 요구사항이라 만들지 않을 수 없는 화면이다.
//
// 진입할 때만 생일을 한 번 확인한다. 앱 전체에는 잠금을 걸지 않는다.
import { useState } from "react";
import { router } from "expo-router";

import { BirthGate, MyInfoScreen } from "@/features/account";
import type { EraseScope, StoredProfile } from "@/features/account/domain/account";
import type { CrimeCategoryId } from "@/shared/types/crime";

// 개발 확인용 표본. 서버 연결이 붙으면 저장된 값을 불러온다.
const DEMO_PROFILE: StoredProfile = {
  name: "김판수",
  birth: "1980-03-15",
  releaseDate: "2026-08-03",
  crime: "property",
  sharesWithStaff: true,
};

export default function MyInfoRoute() {
  const [profile, setProfile] = useState<StoredProfile>(DEMO_PROFILE);
  const [passed, setPassed] = useState(false);

  const close = () => router.back();

  if (!passed) {
    return <BirthGate storedBirth={profile.birth} onPass={() => setPassed(true)} onClose={close} />;
  }

  return (
    <MyInfoScreen
      profile={profile}
      onChangeCrime={(crime: CrimeCategoryId | null) =>
        setProfile((p) => ({ ...p, crime }))
      }
      onErase={(scope: EraseScope) => {
        // 삭제 요청은 즉시 처리한다 (§9.4). 서버 연결이 붙으면 여기서 파기를 요청한다.
        if (scope === "crime") {
          setProfile((p) => ({ ...p, crime: null }));
          return;
        }
        close();
      }}
      onClose={close}
    />
  );
}
