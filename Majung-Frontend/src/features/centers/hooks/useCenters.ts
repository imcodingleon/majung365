// 센터 목록 UseCase — 백엔드 GET /api/centers 조회, 실패 시 데모 폴백(복원력).
import { useCallback, useEffect, useState } from "react";

import type { Center } from "@/shared/types";
import { getCenters } from "@/shared/utils/api";

import { filterDemoCenters } from "../domain/demoCenters";

export interface UseCenters {
  centers: Center[];
  loading: boolean;
  /** 백엔드 연결 실패로 데모 예시를 보여주는 중 */
  usingFallback: boolean;
  reload: () => void;
}

export function useCenters(category: string | null): UseCenters {
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCenters(category ?? undefined);
      setCenters(data);
      setUsingFallback(false);
    } catch {
      // 연결 실패 → 데모 예시로 폴백 (demo-scenario: API 실패 대비)
      setCenters(filterDemoCenters(category));
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  return { centers, loading, usingFallback, reload: load };
}
