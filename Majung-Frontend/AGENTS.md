# AGENTS.md — Majung-Frontend

[마중365] 프론트엔드. Expo(React Native) 단일 코드베이스. **본선은 EAS Build 앱(양대 마켓)이고 웹은 심사·시연 용도로만 유지한다** (기획서 §2.6).

> **예선은 끝났다.** 예선은 5탭 네비게이션·지도·음성·무저장이었고 본선은 **단일 화면 + 아코디언·기관 안내·암호화 저장**이다. 정보 구조가 근본적으로 다르므로 예선 전제를 그대로 이어받지 않는다.

## Tech Stack

- Expo SDK 57 + **expo-router** (파일 기반). RN 0.86 · NativeWind 4.2 · tailwindcss v3
- TypeScript **strict** — `any` 금지, Types first
- 상태: React 기본(useState/context) → 필요 시점에만 Jotai 도입 (YAGNI)
- 위치: `expo-location` — **기기에서 시군구로 바꾸고 좌표는 버린다.** Google Maps Geocoding API를 쓰지 않는다 (§5.4)

> **`app.json`·`eas.json`·`package.json` 의존성 조합은 함부로 바꾸지 않는다.** EAS 프로젝트 ID와 스토어 패키지명이 묶여 있고, Expo SDK 57 조합은 실측으로 검증된 것이다.

## Commands

```bash
npx expo start --web      # 개발 서버 (8081)
npx expo export -p web    # 웹 정적 빌드
npx tsc --noEmit          # 타입 체크
```

## 아키텍처: Frontend DDD

**의존성 방향: `Views → Hooks → Domain → API`. 역방향 import 절대 금지.**

```
src/
├── app/                     # expo-router 라우트 — 화면을 조립하는 껍데기
│   ├── index.tsx            # 가입 여부로 분기. 진입 게이트 없음 (§2.3)
│   ├── signup.tsx           # 가입 + 상황 알아보기 (§3)
│   ├── today.tsx            # 홈. 채팅 팝업·도움 연결·방문 알림을 얹는다
│   ├── nearby.tsx           # 위치 기반 기관 안내 (§5.4)
│   ├── my-info.tsx          # 개인정보 열람·수정·삭제 (§2.5)
│   ├── pamphlet.tsx         # 팜플렛 미리보기 (심사·시연용)
│   └── admin.tsx            # 담당자 화면 (§8.3) — 시연용
├── features/
│   ├── tasks/               # 서류철 인덱스 탭 홈 (§5.1·§5.2)
│   ├── intake/              # 초기 진단 6분야·문항 27개 (§3.7·§3.8)
│   ├── signup/              # 가입·죄목·동의 (§3.2~§3.4)
│   ├── chat/                # AI 채팅 팝업 (§6)
│   ├── visit/               # 방문 알림·요청 상태 (§7)
│   ├── help/                # 상시 도움 연결 (§5.3)
│   ├── institutions/        # 기관 안내 (§5.4)
│   ├── account/             # 내 정보 (§2.5·§9.4)
│   └── pamphlet/
│   └── (각 feature: domain/ hooks/ views/ index.ts)
├── admin/                   # 담당자 화면. **별도 앱으로 떼어낼 것이라 폴더를 나눠 둔다** (§8.3)
└── shared/
    ├── components/          # stateless pure UI
    ├── theme/colors.ts      # tailwind 토큰의 TS 미러 (조건부 색은 인라인 style로만 가능)
    ├── utils/api.ts         # 모든 HTTP 호출은 이 wrapper 경유 (SSE 포함)
    └── types/               # 백엔드 계약 미러 + 여러 feature가 쓰는 계약 개념
```

- **Domain**: 상태·Entity·순수 규칙만. API 호출·React 훅 금지
- **Hooks**: 행동/UseCase. API는 `shared/utils/api.ts`를 통해서만
- **Views**: 렌더링만. 비즈니스 로직 금지. props-driven
- **Feature 간 직접 import 금지** — 공통은 `shared/`로 승격 (2곳 이상 쓰일 때만). 화면이 다른 feature를 가져다 쓰지 않고 **라우트가 조립한다**

## 이 프로젝트 특수 규칙

1. **정본 계약**: 제품 결정은 레포 밖 `majung365_리뉴얼_개발플로_기획안_v2.md`, 개발 계약은 `../_bmad-output/specs/spec-majung-2nd/`. **예선 계약(`spec-majung-demo/`)은 이력이며 충돌 시 본선 결정을 따른다**
2. **서비스명 표기 "마중365"**
3. **저리터러시 UI**: 큰 글씨·카드형 선택지·한 화면에 한 가지. **화면 문구의 어체는 `humanize-korean` 스킬로 점검해 확정한다**
4. **화면에 쓰지 않는 말**: "죄목"("어떤 일로 계셨는지") · "설문"("상황 알아보기") · "영역"("분야")
5. **비밀 금지**: API 키·토큰을 클라이언트 코드/env에 넣지 않는다. AI 호출은 전부 백엔드 경유
6. **자동 로그인 토큰은 `expo-secure-store`에** — iOS Keychain·Android Keystore. `AsyncStorage`나 `localStorage`에 평문으로 두지 않는다 (§2.4)
7. **보이지 않는 답은 보내지 않는다** — 화면에서 사라진 답은 사용자가 철회한 것이다. 완료 판정과 전송이 같은 판정 함수를 쓴다 (§3.8)
8. **위치 좌표를 서버로 보내지 않는다** — 기기에서 시군구로 바꾸고 버린다 (§5.4)
9. 새 의존성 추가 전 사용자 확인. **"이게 어떤 데이터를 어디로 보내나"를 함께 검토한다**
10. 코드 수정 후 `npx tsc --noEmit` 에러 0 확인

## 화면 구현에서 걸리는 것

- **NativeWind는 클래스명을 런타임에 조립하지 못한다.** `bg-${x}`가 동작하지 않으므로 **조건에 따라 갈리는 색은 인라인 style로** 넘긴다. 값은 `shared/theme/colors.ts`에 모아 tailwind 토큰과 짝을 맞춘다
- **RN은 안드로이드에서 부모 경계를 넘어간 절대 위치 자식을 잘라낸다.** 서류철 인덱스 탭의 돌출 기하를 `position:absolute`로 옮기면 안 된다. 카드와 탭을 가로로 붙이고 겹쳐서 같은 인상을 낸다
- **값이 있을 때만 요소가 생기게 한다.** 자리를 먼저 잡아두면 대부분의 카드에 빈 공간이 생긴다. §4.1이 "사유는 대부분 비는 것이 정상"이라고 정해 두었다

## 백엔드 연동

- 비즈니스 로직(triage·제도 매칭·기관 데이터)은 백엔드에만. 프론트는 호출·타입·상태만
- 로컬: BE `http://localhost:8000` / 채팅은 SSE 스트리밍
- **API 계약이 바뀌면 타입 정의를 같은 커밋에서 갱신한다**

## 예선에서 뒤집힌 것 (되살리지 말 것)

| 예선 | 본선 |
|---|---|
| 하단 5탭 네비게이션 | **단일 화면 + 서류철 인덱스 탭 아코디언** (§5.1) |
| 지도 화면 (Google Maps 플랫폼 분기) | **지도 없음.** 시군구 기반 기관 안내 (§5.4) |
| 음성 감정 인식 | **범위에서 제외** |
| 진입 게이트(코드 입력 `s-code`) | **폐지** (§2.3) |
| 홈 탭은 껍데기 | **홈이 핵심 화면**이다 |
| 계정·로그인 없음 | **가입 화면에서 계정을 만들고 기기 세션으로 자동 로그인** (§2.4) |
| 완료 체크는 표시형 | **완료를 누르면 다음 탭이 자동으로 열린다** (§5.2) |
| 탭 안 인라인 채팅 | **화면 전체를 덮는 팝업** (§6.1) |
| 데스크톱 셸 | **모바일 단일 프레임** |
