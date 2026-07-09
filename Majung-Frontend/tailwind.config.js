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
        // ── PC(데스크톱) 팔레트 — 디자이너 시안(majung365_web_v2.html) 실측. 모바일 토큰과 별개.
        navy: {
          900: "#021D38",
          800: "#042C53", // 주 색(navbar·활성)
          600: "#185FA5",
          400: "#378ADD",
          200: "#B5D4F4",
          100: "#E6F1FB",
        },
        sun: { 500: "#EF9F27", 100: "#FAEEDA", 900: "#412402" }, // 오렌지 포인트
        paper: {
          900: "#2C2B28",
          600: "#5F5E5A",
          300: "#B4B2A9",
          100: "#F1EFE8",
          50: "#F8F9FC", // 데스크톱 배경
          border: "#D3D1C7",
        },
      },
    },
  },
  plugins: [],
};
