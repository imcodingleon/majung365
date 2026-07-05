# 기술 스택 — 확정 (2026-07-06)

> 전제: 예선 산출물은 "데모"가 아니라 **개발의 시작** — 본선(앱)까지 같은 코드로 간다.

## 프론트엔드 — `Majung-Frontend/`

| 항목 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **Expo (React Native) + expo-router** | 시안이 네이티브 앱 문법(5탭 바). 예선=웹 export→Vercel, 본선=EAS Build 앱. 코드베이스 1개 |
| 스타일 | **NativeWind 4** (Tailwind 문법) | HailMary 프론트 경험 이식, 웹·네이티브 동일 |
| 언어 | TypeScript 5 strict, `any` 금지 | HailMary 컨벤션 승계 |
| 아키텍처 | Frontend DDD — `features/[name]/domain·hooks·views` | HailMary 컨벤션 승계 |
| 지도 | **Google Maps** — 플랫폼 분기 단일 컴포넌트: `CenterMap.web.tsx`(Maps JS API) / `CenterMap.native.tsx`(react-native-maps, 본선) | 시안이 구글맵. ⚠️ API 키: 사용자가 카드 등록 후 제공 예정 — 그전까지 정적 폴백으로 개발 |
| 채팅 | 커스텀 UI + SSE 스트리밍 | 시안이 커스텀 디자인 |

## 백엔드 — `Majung-Backend/`

| 항목 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **FastAPI** (Python 3.12+, uv) | HailMary 백엔드 컨벤션 승계, 배성현(풀스택) 숙련 스택 |
| 아키텍처 | 헥사고날 경량판 — `app/domains/{chat, knowledge, centers}` | 예선 YAGNI: DB 없음(대화 상태 클라이언트 보관, KB=JSON). 본선 DB 도입 시 구조가 수용 |
| AI | Claude API, 모델 **`claude-sonnet-5`**(현행 Sonnet, `web_search_20260209` 동적필터·adaptive thinking) — **키는 서버에만**, 클라이언트 노출 절대 금지. 민감 응답은 `claude-opus-4-8` 승격 고려 | HailMary Core Rule 승계 · 모델은 상향 |
| 품질 | ruff + mypy 에러 0 유지 | HailMary Core Rule 승계 |

## 배포 · 환경 (2026-07-06 수정)

- **모노레포 1개** (private) — FE/BE 폴더 분리, SSOT(SPEC·memlog)가 코드와 함께 이동. 필요 시 본선 후 `git subtree split`으로 분리 가능
- **FE: Vercel** — git 연동, Root Directory=`Majung-Frontend`, 폴더 무변경 커밋은 자동 빌드 스킵
- **BE: AWS** (보안·팀 숙련 — HailMary EC2 패턴 재사용, 본선 DB 도입 대비) — GitHub Actions `paths: ['Majung-Backend/**']` 필터로 배포 워크플로 분리
- 로컬 포트: BE 8000 / Expo dev 8081 (HailMary와 충돌 없음)
- 지식베이스: 6영역 × 2~3개 제도 JSON — 클로드 초안 → 팀 검수 → 7/8 인터뷰 후 보강
- 공개 전환 정책: private 시작하되 **비밀은 처음부터 커밋 금지**(.env ignore + .env.example) → 나중에 public 전환 시 무작업

## 외부 의존성 대기 목록

- [ ] Google Maps API 키 (사용자: 결제 카드 등록 후 전달) — 도착 전까지 지도는 목업 폴백
- [ ] Claude API 키 (해커톤 주최측 프로젝트 단위 지원 or 팀 키)
