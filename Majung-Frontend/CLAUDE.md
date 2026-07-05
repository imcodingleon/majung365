# CLAUDE.md — Majung-Frontend

[마중365] 프론트엔드. Expo(React Native) 단일 코드베이스 — 예선은 웹 export→Vercel 시연, 본선은 EAS Build 앱(양대 마켓). HailMary-Frontend 컨벤션의 이식판.

## Tech Stack

- Expo SDK (React Native) + **expo-router** (파일 기반, 탭 레이아웃)
- TypeScript 5 **strict** — `any` 금지, Types first
- **NativeWind 4** (Tailwind 문법)
- 상태: React 기본(useState/context) → 필요 시점에만 Jotai 도입 (YAGNI)
- 지도: Google Maps — 플랫폼 분기 컴포넌트 (`.web.tsx` = Maps JS API / `.native.tsx` = react-native-maps)

## Commands

```bash
npx expo start            # 개발 서버 (8081)
npx expo export -p web    # 웹 정적 빌드 (Vercel 배포용)
npx tsc --noEmit          # 타입 체크
npx eslint .              # 린트
```

## 아키텍처: Frontend DDD (HailMary 승계)

**의존성 방향: `Views → Hooks → Domain → API`. 역방향 import 절대 금지.**

```
src/ (또는 app/ 라우트 + src/features/)
├── app/                        # expo-router 라우트 (페이지 껍데기만)
│   ├── (tabs)/                 # 5탭: index(홈)/roadmap/chat/map/profile
│   └── onboarding/             # 온보딩 스택 (탭 진입 전)
├── features/
│   ├── onboarding/             # CAP-1a: 구조화 질문 5단계
│   ├── chat/                   # CAP-1b·2·3: 챗봇, triage, 제도 카드
│   ├── roadmap/                # CAP-4: 표시형 체크리스트
│   └── centers/                # CAP-5: 지도·센터 리스트
│   └── (각 feature: domain/ hooks/ views/ index.ts)
└── shared/
    ├── components/             # stateless pure UI
    ├── utils/api.ts            # 모든 HTTP 호출은 이 wrapper 경유 (SSE 포함)
    └── types/
```

- **Domain**: 상태·Entity·순수 규칙만. API 호출·React 훅 금지
- **Hooks**: 행동/UseCase. API는 `shared/utils/api.ts`를 통해서만
- **Views**: 렌더링만. 비즈니스 로직 금지. props-driven
- Feature 간 직접 import 금지 — 공통은 `shared/`로 승격 (2곳 이상 쓰일 때만)

## 이 프로젝트 특수 규칙

1. **정본 계약은 `../_bmad-output/specs/spec-majung-demo/`** — SPEC.md(CAP·Non-goals), design-map.md(Figma node-id), demo-scenario.md(톤 규칙·테스트 픽스처)
2. **서비스명 표기 "마중365"**, 하단 네비 5탭(홈/로드맵/상담/지도/내 정보) 전 화면 통일 — 로드맵 화면(2:1614)이 네비 정본
3. **저리터러시 UI**: 쉬운 말·큰 글씨·카드형 선택지·프리셋 버튼 우선. 판단하지 않는 톤
4. **Non-goals 준수**: 홈 탭은 껍데기만(기능 없음), 음성 입력 없음(마이크 아이콘 장식), 계정/로그인 없음, 완료 체크 상호작용 없음(표시형)
5. **비밀 금지**: API 키·토큰을 클라이언트 코드/env에 넣지 않는다. AI 호출은 전부 백엔드 경유
6. **플랫폼 분기는 지도 컴포넌트 1곳에 격리** — 다른 곳에서 Platform.OS 분기 남발 금지
7. 디자인 구현 시 Figma `get_design_context`로 해당 node-id의 실측 스타일을 가져와 쓴다 — 눈대중 금지

## 백엔드 연동

- 비즈니스 로직(triage·제도 매칭·센터 데이터)은 백엔드에만. 프론트는 호출·타입·상태만
- 로컬: BE `http://localhost:8000` / 채팅은 SSE 스트리밍
- API 계약이 바뀌면 타입 정의를 같은 커밋에서 갱신

## 작업 가이드

1. 명시적으로 요청받지 않은 파일은 건드리지 않는다. 새 의존성 추가 전 사용자 확인
2. 구현 전 5줄 이내 요약 플랜 제시. 가정은 명시적으로 선언
3. YAGNI — 지금 쓰지 않는 추상화·레이어·파일 금지
4. 코드 수정 후 `npx tsc --noEmit` 에러 0 확인
