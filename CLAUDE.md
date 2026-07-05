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

- 서비스명 표기: **마중365**
- Claude API 키는 백엔드에만 — 프론트 번들에 어떤 비밀도 넣지 않는다
- 익명 사용 전제: 실명·민감정보 수집/저장 없음 (예선)
- 카피는 A 쐐기(공단 시설 내 온보딩) 프레임 — "출소 그다음 날부터 앱을 켠다"류 B 프레임 문구 금지
- 판단하지 않는 톤, 쉬운 말, 큰 글씨 (저리터러시 사용자 전제)
- 관리 노트·SSOT는 Obsidian `출소자 지원 서비스/` 폴더에 (레포 문서가 정본, Obsidian은 관리 요약)
