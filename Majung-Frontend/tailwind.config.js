/** @type {import('tailwindcss').Config} */
// 색·타이포 토큰은 Figma 실측(get_design_context)으로 화면 작업 때 theme.extend에 채운다.
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Figma 실측 브랜드 토큰 (KDT해커톤_마중_Design)
      colors: {
        brand: { DEFAULT: "#024f9f", soft: "#e1eefa" }, // 메인컬러 / 카드 CTA 배경
        chip: { DEFAULT: "#ffdcc0", ink: "#874700" }, // 프리셋 칩
        page: "#f9fbff", // 화면 배경
        ink: {
          DEFAULT: "#3b3b3b", // 본문
          muted: "#939393", // placeholder
          faint: "#a3a3a3", // 타임스탬프
          header: "#838383", // 헤더 타이틀
        },
        line: "#f1f1f1", // 구분선/입력 배경(그레이1)
      },
    },
  },
  plugins: [],
};
