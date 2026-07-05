# [마중365] 출소자 재사회화 온보딩 네비게이터

KDT 해커톤 프로젝트 (팀 '여름아 부탁해', 5인). 예선 7/10 13:00 제출 — 예선 산출물은 데모가 아니라 **개발의 시작**이며 본선(앱)까지 같은 코드로 간다.

## 구조

| 폴더 | 내용 | 규칙 문서 |
|---|---|---|
| `Majung-Frontend/` | Expo(React Native) + expo-router + NativeWind | `Majung-Frontend/CLAUDE.md` |
| `Majung-Backend/` | FastAPI (Python 3.12+, uv) | `Majung-Backend/CLAUDE.md` |
| `_bmad-output/specs/spec-majung-demo/` | **정본 계약**: SPEC.md + demo-scenario.md + design-map.md + stack.md | — |
| `_bmad/`, `.claude/skills/` | BMad-Method 프레임워크 | — |

## 작업 시작 전 필독

1. **`_bmad-output/specs/spec-majung-demo/SPEC.md`** — CAP-1~5, 제약, Non-goals. 이 계약을 벗어나는 구현 금지
2. **`design-map.md`** — Figma 화면↔CAP 매핑 (fileKey `h97VLfum9A07yPPwS0bJQq`, 각 화면 node-id 포함)
3. **`demo-scenario.md`** — 김판수 시나리오 = 테스트 픽스처 + 쉬운 말 톤 규칙

## 전역 불변 규칙

### 🔒 0. 보안이 1번이다 — "첫째도 보안, 둘째도 보안"

출소자 대상 서비스: **출소 사실 자체가 극도로 민감한 개인정보**이며, 유출은 사용자의 사회 복귀를 파괴한다. 편의성과 보안이 충돌하면 항상 보안을 택한다.

1. **데이터 최소화** — 수집·저장·로그 기본 0. 필요 최소만, 근거를 남기고
2. **대화 내용 = 민감정보** — 서버 로그·에러 리포트에 사용자 입력 원문 금지 (마스킹)
3. **비밀 커밋 금지** — .env만, 클라이언트 번들에 키 금지 (Maps 웹 키는 도메인 제한 필수)
4. **서드파티 추가는 사용자 확인 필수** — 트래킹·SDK·의존성 하나 추가할 때마다 "이게 어떤 데이터를 어디로 보내나" 검토
5. **본선(실데이터)**: 실명·식별정보는 마스킹·토큰화 후에만 AI API 전달 (0703 회의 배성현 설계 준수)
6. **public 전환 전 보안 검토 필수** — 히스토리 포함

### 기타 불변 규칙

- 서비스명 표기: **마중365**
- Claude API 키는 백엔드에만 — 프론트 번들에 어떤 비밀도 넣지 않는다
- 익명 사용 전제: 실명·민감정보 수집/저장 없음 (예선)
- 카피는 A 쐐기(공단 시설 내 온보딩) 프레임 — "출소 그다음 날부터 앱을 켠다"류 B 프레임 문구 금지
- 판단하지 않는 톤, 쉬운 말, 큰 글씨 (저리터러시 사용자 전제)
- 관리 노트·SSOT는 Obsidian `출소자 지원 서비스/` 폴더에 (레포 문서가 정본, Obsidian은 관리 요약)
