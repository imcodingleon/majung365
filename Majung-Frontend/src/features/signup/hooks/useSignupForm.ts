// 가입 입력 상태 (§3.2~§3.4).
//
// 개인정보 입력·죄목·동의가 서로 맞물린다. 죄목을 밝히면 죄목 동의 항목이 나타나고,
// "말하고 싶지 않아요"로 되돌리면 그 항목과 체크가 함께 사라진다. 수집하지 않는 정보에
// 동의를 받아둔 상태로 남겨서는 안 된다.
import { useCallback, useMemo, useState } from "react";

import {
  consentSatisfied,
  EMPTY_CONSENT,
  EMPTY_DATE,
  isValidDate,
  needsCrimeConsent,
  type ConsentId,
  type ConsentState,
  type CrimeCategoryId,
  type DateParts,
} from "../domain/signup";

export function useSignupForm() {
  const [name, setName] = useState("");
  const [birth, setBirth] = useState<DateParts>(EMPTY_DATE);
  const [releaseDate, setReleaseDate] = useState<DateParts>(EMPTY_DATE);
  const [crime, setCrime] = useState<CrimeCategoryId | null>(null);
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);

  const selectCrime = useCallback((id: CrimeCategoryId) => {
    setCrime(id);
    // 죄목을 말하지 않기로 바꾸면 받아둔 죄목 동의도 함께 거둔다.
    if (!needsCrimeConsent(id)) {
      setConsent((prev) => ({ ...prev, crime: false }));
    }
  }, []);

  const toggleConsent = useCallback((id: ConsentId) => {
    setConsent((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleAllConsent = useCallback(
    (next: boolean) => {
      setConsent({
        privacy: next,
        crime: needsCrimeConsent(crime) ? next : false,
        share: next,
      });
    },
    [crime],
  );

  const personalReady = useMemo(
    () => name.trim().length > 0 && isValidDate(birth) && isValidDate(releaseDate),
    [birth, name, releaseDate],
  );

  const consentReady = useMemo(() => consentSatisfied(crime, consent), [consent, crime]);

  return {
    name,
    setName,
    birth,
    setBirth,
    releaseDate,
    setReleaseDate,
    crime,
    selectCrime,
    consent,
    toggleConsent,
    toggleAllConsent,
    /** 개인정보 입력이 다 찼는지. */
    personalReady,
    /** 화면에 보이는 필수 동의를 다 체크했는지. */
    consentReady,
  };
}
