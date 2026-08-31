/** @type {import('tailwindcss').Config} */
// 색 토큰 정본: _bmad-output/specs/spec-majung-2nd/dev-handoff-frontend-renewal.md §3
// 주 색은 네이비(#024f9f)를 유지하고, 프로토타입의 따뜻한 인상은 sun·chip 계열이 맡는다.
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // ── 글자 크기. **여섯 단계로 끝낸다.**
      //
      // 정리 전에는 18가지가 쓰였고 큰 제목만 21·22·23·25·26px 다섯 가지였다.
      // 한두 번씩만 쓰인 크기들이라 화면마다 제목이 미묘하게 달라 보였다.
      //
      // **저리터러시 전제라 아래가 잘려 있다.** 12px 이하를 두지 않았고 본문이 15px에서
      // 시작한다. 흔한 웹 스케일이라면 caption이 12px이겠지만 여기서는 13px이 바닥이다.
      //
      // 이름으로 부르면 "이 자리가 무엇인가"가 코드에 남는다. `text-[19px]`는 왜 19인지
      // 알 수 없지만 `text-heading`은 카드 제목이라는 뜻이다.
      fontSize: {
        display: ["26px", { lineHeight: "36px" }], // 화면 제목
        title: ["21px", { lineHeight: "30px" }], // 구역 제목
        heading: ["18px", { lineHeight: "26px" }], // 카드 제목·화면 머리
        "body-lg": ["17px", { lineHeight: "27px" }], // 선택지·버튼
        body: ["15px", { lineHeight: "25px" }], // 기본 본문
        caption: ["13px", { lineHeight: "21px" }], // 보조 설명
      },
      colors: {
        // tint는 **고른 것을 나타내는 배경**이다 (2026-08-31 시안). soft보다 옅어서
        // 흰 카드 위에 얹어도 글자를 밀어내지 않는다. soft는 안내 상자처럼 덩어리로
        // 칠하는 자리에 그대로 둔다.
        brand: { DEFAULT: "#024f9f", soft: "#e1eefa", tint: "#f1f7ff", muted: "#b9cde4" }, // 주 색 / 주 색 배경 / 선택 배경 / 비활성
        sun: { 500: "#EF9F27", 700: "#e04e00", 100: "#FAEEDA", 900: "#412402" }, // 강조·포인트
        chip: { DEFAULT: "#ffdcc0", ink: "#874700" }, // 프리셋 칩
        page: "#f9fbff", // 화면 배경
        ink: {
          DEFAULT: "#3b3b3b", // 본문
          muted: "#939393", // placeholder
          faint: "#a3a3a3", // 타임스탬프
          header: "#838383", // 헤더 타이틀
          // 아래 셋은 프로토타입 실측. 새 화면의 제목·보조 설명·카드 본문이 쓴다.
          strong: "#1c2333", // 제목·강조 (프로토타입 --ink)
          sub: "#5b6474", // 보조 설명 (프로토타입 --sub)
          body: "#333c4e", // 카드 본문
          // 항목에 딸린 한 줄 설명 (2026-08-31 시안). sub보다 밝고 muted보다 어둡다 —
          // 본문으로 읽히면 안 되지만 placeholder처럼 흐려도 안 되는 자리다.
          hint: "#7a8291",
        },
        // strong은 말풍선 안쪽처럼 배경이 이미 회색인 곳의 구분선이다.
        line: { DEFAULT: "#f1f1f1", strong: "#dfe3ec" },
        card: "#fbfcfe", // 펼쳐진 카드 배경
        bubble: "#f1f3f8", // AI 답변 말풍선
        // 안내 박스 두 갈래. 확인된 안내는 파랑, 참고하거나 주의할 안내는 노랑을 쓴다.
        note: {
          info: "#eef7ff",
          "info-line": "#cfe6ff",
          "info-ink": "#1c5f9e",
          warn: "#fff8e6",
          "warn-line": "#f2dfa8",
          "warn-ink": "#8a6d1a",
        },
        // 서류철 인덱스 탭의 항목별 색. 중요도 순서대로 배정하는 분류용 색이며
        // 브랜드 색과 역할이 다르다. 런타임 배정은 features/tasks/domain/palette.ts가 맡는다.
        folder: {
          1: "#ef4444",
          2: "#f97316",
          3: "#eab308",
          4: "#16a34a",
          5: "#2563eb",
          6: "#7c3aed",
          done: "#16a34a", // 완료 표시
          "done-bg": "#f3faf4",
          "done-line": "#bfe3c6",
          "done-ink": "#3e7a49",
        },
        // 도움 연결(§5.3)의 긴급신고 영역. 상담 번호와 성격이 달라 색으로 분리한다.
        alert: { DEFAULT: "#dc2626", soft: "#fef2f2", line: "#fecaca", ink: "#991b1b" },
        // ── PC(데스크톱) 팔레트. DesktopShell 폐기와 함께 정리 대상이다.
        // e8 세션이 DesktopShell.tsx를 만지는 중이라 이번 커밋에서는 남겨 둔다.
        navy: {
          900: "#021D38",
          800: "#042C53",
          600: "#185FA5",
          400: "#378ADD",
          200: "#B5D4F4",
          100: "#E6F1FB",
        },
        paper: {
          900: "#2C2B28",
          600: "#5F5E5A",
          300: "#B4B2A9",
          100: "#F1EFE8",
          50: "#F8F9FC",
          border: "#D3D1C7",
        },
      },
    },
  },
  plugins: [],
};
