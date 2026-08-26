// 개인정보 열람·수정·삭제 (§2.5·§9.4). 법적 요구사항이라 만들지 않을 수 없는 화면이다.
//
// 진입할 때만 생일을 한 번 확인한다. 앱 전체에는 잠금을 걸지 않는다.
//
// **서버에서 읽고 서버에서 지운다.** 저장한다고 알리면서 지울 길이 없으면 §3.5 고지가
// 거짓말이 된다. 그래서 가입을 서버에 붙이는 것과 이 화면을 잇는 것이 한 묶음이다.
//
// **죄목 값은 서버가 내려보내지 않는다.** 화면에 띄우면 어깨 너머로 보인다. 저장해 두었는지
// 여부만 오고, 고치는 것이 아니라 철회만 된다 (§9.5).
import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";

import { BirthGate, MyInfoScreen } from "@/features/account";
import type { EraseScope, StoredProfile } from "@/features/account/domain/account";
import type { CrimeCategoryId } from "@/shared/types/crime";
import { ApiError, deleteMe, getMe, patchMe } from "@/shared/utils/api";
import { endSession } from "@/shared/utils/session";
import { clearToken, loadToken } from "@/shared/utils/tokenStore";

export default function MyInfoRoute() {
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [passed, setPassed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => router.back(), []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const token = await loadToken();
      if (!token) {
        // 이 기기에 가입 기록이 없다. 볼 것이 없으므로 되돌린다.
        if (alive) close();
        return;
      }
      try {
        const me = await getMe(token);
        if (!alive) return;
        setProfile({
          name: me.name,
          birth: me.birth_date,
          releaseDate: me.release_date,
          // 값이 아니라 있는지 여부만 온다 (§2.5). **그 자리를 무엇으로도 채우지 않는다.**
          hasCrime: me.has_crime_category,
          sharesWithStaff: true,
        });
      } catch (err) {
        if (!alive) return;
        setError(
          err instanceof ApiError ? err.message : "내 정보를 불러오지 못했어요.",
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [close]);

  /**
   * 죄목을 새로 밝힌다 (§3.3-3).
   *
   * **오래 빠져 있던 짝이다.** 철회만 있고 밝히는 길이 없어서, 화면에서 고른 값은
   * 아무 데도 가지 않고 사라졌다. "바꾸기"라고 적혀 있는데 실제로는 지우기뿐이었다.
   */
  const tell = useCallback(async (crime: CrimeCategoryId) => {
    const token = await loadToken();
    if (!token) return;
    try {
      const me = await patchMe(token, {
        crime_category: crime,
        crime_consent_agreed: true,
      });
      setProfile((p) => (p ? { ...p, hasCrime: me.has_crime_category } : p));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "지금은 저장하지 못했어요.");
    }
  }, []);

  const erase = useCallback(
    async (scope: EraseScope) => {
      const token = await loadToken();
      if (!token) {
        close();
        return;
      }
      try {
        if (scope === "crime") {
          // 죄목만 철회한다. 다른 정보는 그대로 남는다 (§9.5).
          await patchMe(token, { crime_category_revoked: true });
          setProfile((p) => (p ? { ...p, hasCrime: false } : p));
          return;
        }
        // 모든 정보 삭제. **서버에서 지운 다음 기기의 열쇠도 지운다** — 순서가 바뀌면
        // 서버에는 남았는데 지울 방법이 없는 상태가 된다.
        await deleteMe(token);
        await clearToken();
        endSession();
        router.replace("/signup");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "지금은 처리하지 못했어요.");
      }
    },
    [close],
  );

  if (!profile) {
    // 불러오는 중이거나 실패한 상태다. 실패를 조용히 넘기지 않는다.
    return (
      <BirthGate
        storedBirth=""
        onPass={() => undefined}
        onClose={close}
        onEraseAll={() => void erase("account")}
        error={error}
      />
    );
  }

  if (!passed) {
    return (
      <BirthGate
        storedBirth={profile.birth}
        onPass={() => setPassed(true)}
        onClose={close}
        onEraseAll={() => void erase("account")}
      />
    );
  }

  return (
    <MyInfoScreen
      profile={profile}
      error={error}
      onChangeCrime={(crime: CrimeCategoryId | null) => {
        // 지우는 것과 밝히는 것이 다른 길이다. 철회는 권리라 동의를 다시 받지 않고,
        // 밝히는 것은 민감정보라 동의를 먼저 받는다 (§9.5). 동의는 화면이 받아 왔다.
        if (crime === null) {
          void erase("crime");
          return;
        }
        void tell(crime);
      }}
      onErase={erase}
      // 이 화면을 덮고 열지 않고 밀어 넣는다. 다시 하기를 그만두면 여기로 돌아온다.
      onRetake={() => router.push("/retake")}
      onClose={close}
    />
  );
}
