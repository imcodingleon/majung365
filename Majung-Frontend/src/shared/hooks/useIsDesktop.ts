// 반응형 구조 분기의 단일 프리미티브 — 치수 기반(Platform.OS 분기 금지 규칙 준수).
// 값은 Tailwind 기본 `lg`(1024)와 반드시 일치해야 스타일(lg:)과 구조 분기가 같이 움직인다.
import { useWindowDimensions } from "react-native";

export const DESKTOP_MIN_WIDTH = 1024;

export function useIsDesktop(): boolean {
  return useWindowDimensions().width >= DESKTOP_MIN_WIDTH;
}
