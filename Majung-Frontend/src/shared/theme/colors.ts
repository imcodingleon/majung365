// tailwind.config.js 색 토큰의 TypeScript 미러.
//
// NativeWind는 클래스명을 런타임에 조립하지 못하므로(`bg-${x}`가 동작하지 않는다)
// **조건에 따라 갈리는 색은 인라인 style로 넘겨야 한다.** 그 자리에 쓸 값을 여기 모은다.
// 값이 바뀌면 tailwind.config.js의 같은 이름 토큰도 함께 고친다.

export const COLORS = {
  brand: "#024f9f",
  brandSoft: "#e1eefa",
  brandMuted: "#b9cde4",

  sun500: "#EF9F27",
  sun700: "#e04e00",

  inkStrong: "#1c2333",
  inkSub: "#5b6474",
  inkBody: "#333c4e",
  inkMuted: "#939393",

  line: "#f1f1f1",
  lineStrong: "#dfe3ec",
  surface: "#ffffff",
  card: "#fbfcfe",
  bubble: "#f1f3f8",

  noteInfo: "#eef7ff",
  noteInfoLine: "#cfe6ff",
  noteInfoInk: "#1c5f9e",
  noteWarn: "#fff8e6",
  noteWarnLine: "#f2dfa8",
  noteWarnInk: "#8a6d1a",

  alert: "#dc2626",
  alertSoft: "#fef2f2",
  alertLine: "#fecaca",
  alertInk: "#991b1b",

  // 완료 표시 계열. 인덱스 탭의 항목별 색과 달리 상태를 뜻한다.
  doneBg: "#eef9f0",
  doneLine: "#bfe3c6",
  doneInk: "#2c6e3b",

  // 담당자 연결처럼 안내와 성격이 다른 동작에 쓰는 파랑.
  action: "#2563eb",
  actionLine: "#bcd4f0",
} as const;
