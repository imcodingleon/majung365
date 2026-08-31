// tailwind.config.js 색 토큰의 TypeScript 미러.
//
// NativeWind는 클래스명을 런타임에 조립하지 못하므로(`bg-${x}`가 동작하지 않는다)
// **조건에 따라 갈리는 색은 인라인 style로 넘겨야 한다.** 그 자리에 쓸 값을 여기 모은다.
// 값이 바뀌면 tailwind.config.js의 같은 이름 토큰도 함께 고친다.

export const COLORS = {
  brand: "#024f9f",
  brandSoft: "#e1eefa",
  /** 고른 것을 나타내는 배경. soft보다 옅어 흰 카드 위에서 글자를 밀어내지 않는다. */
  brandTint: "#f1f7ff",
  brandMuted: "#b9cde4",
  /**
   * 브랜드색 글자를 얹는 작은 배지의 바탕 ("복수 선택 가능", 전화 아이콘 원).
   * `soft`보다 조금 진해서 흰 바탕 위에서 덩어리로 읽힌다.
   */
  brandBadge: "#dce9f4",

  sun500: "#EF9F27",
  sun700: "#e04e00",

  inkStrong: "#1c2333",
  inkSub: "#5b6474",
  inkBody: "#333c4e",
  /** 항목에 딸린 한 줄 설명. sub보다 밝고 muted보다 어둡다. */
  inkHint: "#7a8291",
  inkMuted: "#939393",
  /** 말풍선과 목록에 붙는 시각. 본문을 읽는 데 방해되지 않을 만큼 옅다. */
  inkFaint: "#a3a3a3",

  /**
   * 웹에서 모바일 프레임 바깥. **앱에는 없는 색이다.**
   *
   * 프레임 안(연한 회백)보다 어두워야 경계가 보이고, 너무 어두우면 화면이 액자처럼
   * 갇혀 보인다. 잉크 계열의 가장 옅은 단계를 쓴다.
   */
  frameOutside: "#e8eaef",

  line: "#f1f1f1",
  lineStrong: "#dfe3ec",
  surface: "#ffffff",
  card: "#fbfcfe",
  bubble: "#f1f3f8",

  // 채팅 첫 마디 칩. 브랜드 파랑과 층을 갈라 **누르면 보내지는 것**임을 나타낸다 —
  // 파랑으로 두면 이미 오간 말풍선과 섞인다.
  chip: "#ffdcc0",
  chipInk: "#874700",

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

  /**
   * 카드 안 체크 목록의 체크 (2026-08-31 시안).
   *
   * **`doneInk`와 다른 초록이다.** 이쪽은 밝고 저쪽은 짙다. 시안이 둘을 갈라 놓았는데,
   * 체크 목록은 "이런 것이 있다"는 안내이고 완료 표시는 "끝냈다"는 상태라 무게가 다르다.
   */
  doneMark: "#34c759",

  // 완료 표시 계열. 인덱스 탭의 항목별 색과 달리 상태를 뜻한다.
  //
  // **2026-08-31에 tailwind 쪽 값으로 맞췄다.** 여기가 `#eef9f0`·`#2c6e3b`였고
  // tailwind의 `folder.done-bg`·`folder.done-ink`가 `#f3faf4`·`#3e7a49`라 같은 자리를
  // 두 값이 칠하고 있었다. `palette.ts`의 `FOLDER_DONE`이 tailwind 쪽과 같아 그것을 정본으로 봤다.
  doneBg: "#f3faf4",
  doneLine: "#bfe3c6",
  doneInk: "#3e7a49",

  // 담당자 연결처럼 안내와 성격이 다른 동작에 쓰는 파랑.
  action: "#2563eb",
  actionLine: "#bcd4f0",
} as const;
