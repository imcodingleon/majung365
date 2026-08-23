# CLAUDE.md — Majung-Backend

[마중365] 백엔드. FastAPI — triage(지원 항목 분류)·제도 매칭 안내·기관 데이터 API. HailMary-Backend 헥사고날 컨벤션의 경량판.

> **예선은 끝났다.** 예선은 무저장·익명 전제였고 본선은 암호화 저장·기기 세션이다. 아래 규칙은 본선 기준이며, 예선 전제를 그대로 이어받지 않는다.

## Tech Stack

| 항목 | 선택 |
|---|---|
| 언어 | Python 3.12+ (uv) |
| 프레임워크 | FastAPI |
| 검증 | Pydantic v2 |
| AI | Claude API (SSE 스트리밍) |
| 지식베이스 | JSON 파일 (`app/domains/knowledge/data/`) — 제도·기관 데이터는 공용이라 파일로 충분하다 |
| 사용자 데이터 | **DB 필요.** 가입 정보·죄목·대화 내역·방문 요청을 암호화 저장한다 (기획서 §9). 도입 전까지 저장이 필요한 기능은 만들 수 없다 |
| 배포 | AWS (EC2, HailMary 패턴 재사용). GitHub Actions `paths` 필터 |

## Commands

```bash
uv run uvicorn app.main:app --reload --port 8000   # 개발 서버
uv run ruff check .                                # 린트
uv run mypy app/                                   # 타입 체크
uv run pytest                                      # 테스트
```

## 구조 (헥사고날 경량판)

```
app/
├── domains/
│   ├── chat/                    # triage + 안내 생성 (§6)
│   │   ├── domain/              # 지원 항목 분류 규칙, 프롬프트 (순수 Python)
│   │   ├── application/         # UseCase, Request/Response DTO
│   │   └── adapter/
│   │       ├── inbound/api/     # POST /api/chat (SSE)
│   │       └── outbound/external/   # Claude API 클라이언트
│   ├── knowledge/               # 제도 지식베이스
│   │   ├── data/institutions.json   # 지원 항목별 제도 (route_ids·lead_for)
│   │   ├── domain/
│   │   ├── application/
│   │   └── adapter/inbound/api/     # GET /api/knowledge/...
│   ├── centers/                 # 기관 안내 (§5.4) — 지도 폐기, 시군구 기반
│   │   ├── data/koreha_branches.json        # 공단 기관 38건 (kind: branch/head/training/hug)
│   │   ├── data/mental_health_centers.json  # 기초정신건강복지센터 246건
│   │   └── adapter/inbound/api/     # GET /api/centers · district-offices
│   └── shared/routes.py         # RouteId·SectionId — 지원 항목·분야 표준 식별자
├── infrastructure/
│   └── config/settings.py       # 환경변수 (Pydantic BaseSettings) — 유일한 진입점
└── main.py                      # FastAPI 진입점, DI 와이어링
```

레이어 의존성: `Adapter → Application → Domain`. 의존성은 항상 안쪽으로만.

## MUST 규칙

1. **Domain은 순수 Python** — FastAPI/httpx/Pydantic-외부API import 금지. 프롬프트는 `chat/domain/`에 (비즈니스 로직)
2. **환경변수는 `infrastructure/config/settings.py`에서만** — `os.environ` 직접 접근 금지
3. **Claude API 호출은 `adapter/outbound/external/claude_client.py`에서만**
4. **Router에 비즈니스 로직 금지** — 2줄 초과 분기는 UseCase로
5. **DTO 경유** — Domain Entity를 API Response로 직접 반환 금지
6. **코드 수정 후 `uv run ruff check . && uv run mypy app/` 에러 0 확인**
7. **저장하는 것은 암호화하고, 로그에는 남기지 않는다** — 본선은 가입 정보·죄목·대화 내역을 저장한다(기획서 §9). 다만 **로그·에러 리포트에 사용자 입력 원문을 남기지 않는다.** 저장과 로깅은 다른 문제다
   - **죄목은 민감정보에 준해 별도 테이블에 둔다.** 동의를 철회하면 그 행만 지운다 (§9.5)
   - **보이지 않는 답은 받지 않는다.** 화면에서 사라진 답은 사용자가 철회한 것이다. 특정 키가 항상 온다고 가정하지 않는다 (§3.8)
   - **위치 좌표를 받지 않는다.** 시군구만 받는다 (§5.4)
   - 보관 기간은 마지막 접속일로부터 1년. 사용자 요청 시 즉시 파기 (§9.4)
8. 유저 입력은 신뢰하지 않는다 — 프롬프트 인젝션 대비: 시스템 프롬프트에 역할 고정, KB 밖 제도명 생성 금지 지시
9. **정보 소스 2-tier**: 제도·신청·서류(정확성 필수)=KB 카드만 / 일상 질문=네이티브 `web_search` 서버 툴(`web_search_20260209`) — `allowed_domains` 공공 도메인 한정 + `max_uses` 상한 + 검색 쿼리에 사용자 개인 상황 서술 배제(시스템 프롬프트 지시). 별도 검색 에이전트·크롤러 구현 금지

## 이 프로젝트 특수 규칙

- **분류 단위는 지원 항목(route)이다.** 폐기된 6영역(`Area`) 대신 `RouteId`(R1~R4·R6~R15)와 `SectionId`(S1~S6, 초기 진단 6분야)를 쓴다. `app/domains/shared/routes.py`가 표준 정의다
  - **R5(가족지원)는 결번이다.** 번호를 다시 매기지 않는다 — 기획서의 모든 참조가 어긋난다
  - KB는 `route_ids` 배열로 항목에 붙는다(한 제도가 여러 항목의 근거일 수 있다). `lead_for`가 항목별 대표 제도를 정하고, 카드는 대표 1개가 나간다. 로더가 부팅 시 검증한다
- **정본 계약**: `../_bmad-output/specs/spec-majung-2nd/` — intake-contract.md(용어·6분야↔지원 항목), intake-questions.md(문항 세트), route-contacts.md(항목별 연락처), graph-design.md(그래프 데이터 설계). 제품 결정의 정본은 같은 폴더의 `majung365_리뉴얼_개발플로_기획안_v2.md`다
  **예선 계약(`spec-majung-demo/`)은 이력이다.** 같은 사안에서 충돌하면 본선 결정을 따른다
- **안내 응답 형식**: 제도명 명시 + 어디서·무슨 서류·다음 단계. 한 문장 = 한 지시. **화면에 나가는 문구의 어체는 `humanize-korean` 스킬로 점검해 확정한다**
- **KB 밖 환각 금지**: 제도 안내는 `knowledge/data/` 내 항목만 인용
- **근거 3단계** (§6.4): ① KB에서 찾으면 그대로 답하고 출처와 **마중365가 확인한 날짜**를 표시한다 ② 못 찾으면 **검색 전에 먼저 알리고** 웹 검색 결과임을 명시한다 ③ 연락처는 단계와 무관하게 서버가 붙인다. **LLM에게 맡기지 않는다**
  - **기관명을 번호와 반드시 함께 낸다.** 지부·지사 번호를 대표번호 자리에 넣지 않는다
  - **번호를 근거 문서 본문에서 자동 추출하지 않는다.** 지역 지부 번호와 시스템 헬프데스크 번호가 섞여 나온다. `route-contacts.md`의 표를 고정값으로 쓴다
- Claude 모델: `claude-sonnet-5` — 현행 Sonnet(near-Opus 품질·저비용), `web_search_20260209` 동적필터 지원, adaptive thinking 기본. 가장 민감한 응답 경로는 `claude-opus-4-8` 승격 고려. (HailMary는 sonnet-4-6이지만 마중은 상향)
- API 실패 시 재시도 안내 문구 반환
