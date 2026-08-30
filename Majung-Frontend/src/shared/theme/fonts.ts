// 글꼴 이름 (2026-08-31 · 디자이너 시안 반영).
//
// 화면 글꼴은 Pretendard 한글 서브셋 판이다. 싣는 자리는 `src/app/_layout.tsx`이고,
// 클래스(`font-bold` 등)가 어떤 파일을 가리키는지는 `src/global.css`가 정한다.
//
// **이 상수는 클래스를 못 쓰는 자리에만 쓴다.** NativeWind는 클래스명을 런타임에
// 조립하지 못해서, 색이나 굵기를 조건에 따라 고르는 자리는 인라인 style로 넘겨야 한다
// (`colors.ts`가 색에 대해 하고 있는 것과 같다).
//
// **`fontWeight`와 짝지어 쓰지 않는다.** 굵기는 파일이 이미 정하고 있다. 굵기 값을
// 함께 주면 웹 브라우저가 그 위에 굵기를 한 번 더 씌워 두 겹이 된다.
export const FONTS = {
  regular: "Pretendard-Regular",
  medium: "Pretendard-Medium",
  semibold: "Pretendard-SemiBold",
  bold: "Pretendard-Bold",
  extrabold: "Pretendard-ExtraBold",
} as const;
