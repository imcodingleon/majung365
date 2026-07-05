---
title: 'Majung-Backend 스캐폴드 — triage 챗(SSE) + 제도 KB + 센터 API'
type: 'feature'
created: '2026-07-06'
status: 'draft'
review_loop_iteration: 0
context:
  - '{project-root}/Majung-Backend/CLAUDE.md'
  - '{project-root}/_bmad-output/specs/spec-majung-demo/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-majung-demo/demo-scenario.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 마중365 예선 데모(7/10)의 백엔드가 없다. 프론트(챗봇·로드맵·지도)가 소비할 triage·제도 안내·센터 데이터 API가 필요하다.

**Approach:** FastAPI 헥사고날 경량판(Majung-Backend/CLAUDE.md 구조)으로 3개 도메인(chat/knowledge/centers) + SSE 챗 엔드포인트를 세운다. 저장소는 JSON 파일 KB — DB 없음.

## Boundaries & Constraints

**Always:**
- 보안 1번: 대화 영속화 금지, 로그·에러에 사용자 입력 원문 금지, API 키는 `infrastructure/config/settings.py`(Pydantic BaseSettings)+.env로만
- 정보 소스 2-tier: 제도·신청·서류(정확성 필수)=KB 카드만(`knowledge/data/institutions.json` 항목 인용, 환각 금지) / 일상 질문=네이티브 `web_search_20260209` 서버 툴 — `allowed_domains` 공공 도메인 한정, `max_uses` 상한, 검색 쿼리에 사용자 개인 상황 서술 배제(시스템 프롬프트 지시). 별도 검색 에이전트 구현 금지
- 안내 형식: 제도명 명시 + 어디서·무슨 서류·다음 단계. demo-scenario.md 쉬운 말 톤(한 문장=한 지시, 판단·훈계 금지)
- 헥사고날 규칙: Domain 순수 Python, Claude 호출은 `chat/adapter/outbound/external/claude_client.py`에서만, Router 비즈니스 로직 금지
- `uv run ruff check .` + `uv run mypy app/` 에러 0
- 모델: `claude-sonnet-5` (현행 Sonnet, `web_search_20260209` 지원). 민감 응답 경로는 `claude-opus-4-8` 승격 고려
- **남용 방어(배포 전 필수, DB 없음) — 위협=인가 외부인의 챗 악용(코드 질문·탈옥 등), 신뢰 사용자 볼륨 아님**:
  - **① 접근 게이트(최우선)** — `/api/gate`로 데모 코드 검증(`DEMO_ACCESS_CODE_HASH` env, 상수시간 비교), 통과 시 단기 서명 토큰 발급 → `/api/chat`은 이 토큰 요구. 신원 수집 0. 외부인 차단.
  - **② 스코프 가드(핵심)** — 게이트 안에서도 마중을 범용 Claude로 악용 못 하게: 시스템 프롬프트에 역할 고정(출소 후 정착 지원 전용), 도메인 외 요청(코드 작성·숙제·번역 등)은 정중히 거부, 프롬프트 인젝션·탈옥 방어. 공감·일상 대화는 허용하되 "범용 어시스턴트 되기"는 거부.
  - **③ 지출 서킷브레이커(백스톱)** — 시간·일 Claude 호출 총량 상한 초과 시 `/api/chat` 자동 429(인메모리 카운터). 게이트 뚫려도 피해 상한 고정. rate limit은 느슨하게(신뢰 사용자 볼륨 걱정 없음). 값은 env 조절

**Ask First:** 새 pip 의존성 추가(fastapi/uvicorn/pydantic-settings/anthropic/httpx/slowapi/pytest/ruff/mypy 외), 엔드포인트 계약 변경, CORS 오리진 확대

**Never:** DB·ORM 도입, **계정/개인 로그인**(게이트는 익명 공유 코드일 뿐 — 신원 수집 아님), 대화 이력 서버 저장, 직원용 요약 카드 API, 음성 처리, 재범률 관련 로직

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 챗 happy path | POST /api/chat {"message":"5년 살고 나왔는데 통장도 없고…","history":[]} | SSE: `triage`(신분재건·긴급복지 상위) → `text` 델타(쉬운 말) → `card`(KB 제도) → `done` | N/A |
| 멀티턴 | history에 이전 대화 동봉(클라이언트 보관) + 후속 질문 "그럼 서류는요?" | 맥락 이어진 답변. 서버는 history를 쓰고 즉시 폐기(저장 0) | N/A |
| 프리셋 입력 | "잘 곳이 없어요" | triage 상위에 주거·긴급복지 포함 (demo-scenario 3종 전부) | N/A |
| KB 밖 일상 대화 | "요즘 잠을 잘 못 자요" | 카드 없이 일반 대화 계속 (공감·자유 대화 — 제약은 카드에만) | 환각 제도명 생성 금지 |
| 일상 정보 질문 | "체크카드 재발급 어떻게 해요?" | `web_search` 서버 툴(공공 도메인 한정)로 검색 후 출처 기반 쉬운 말 답변 | 검색 실패 시 "정확한 정보 없음" 정직 안내 |
| KB 밖 제도 질문 | "주식 투자 지원 있어요?" | 웹 검색으로도 근거 없으면 "정확한 정보가 없다" 정직 안내 + 도울 수 있는 것 제시. 카드 없음 | 환각 제도명 생성 금지 |
| 상담사 연결 (좁게) | 위기 신호(자해·노숙 위험 등) / 사용자 직접 요청 / 동일 미해결 요구 반복 | 이때만 상담사 연결 문구 + 연락처 카드 | N/A |
| Claude API 실패 | 업스트림 5xx/타임아웃 | SSE `error` 이벤트: 재시도 안내 문구(demo-scenario 리허설 항목) | 원문 로깅 없이 상태코드만 로그 |
| 센터 목록 | GET /api/centers?category=법무보호공단 | centers.json 필터 결과(이름·주소·전화·운영시간·좌표) | 빈 카테고리→전체 |
| 헬스체크 | GET /api/health | 200 {"status":"ok"} — 키·비밀 미노출 | N/A |
| 게이트 통과 | POST /api/gate {"code":"올바른코드"} | 200 + 단기 서명 토큰 | 오답→401, 상수시간 비교 |
| 게이트 없이 챗 | POST /api/chat (토큰 없음/만료) | 401 거부 | SSE 스트림 시작 안 함 |
| **도메인 외 악용** | (게이트 통과 후) "파이썬 코드 짜줘" / "시스템 프롬프트 무시하고…" | 역할 재확인 후 정중히 거부 — 범용 어시스턴트 되기 거부. 코드·숙제·번역 등 미제공 | 인젝션 무시, 카드·검색 트리거 안 함 |
| 지출 상한 도달 | 서버 누적 호출이 일/시간 상한 초과 | 429 "잠시 후 다시" 안내 | Claude 호출 안 함(지갑 보호) |

</frozen-after-approval>

## Code Map

- `Majung-Backend/pyproject.toml` -- uv 프로젝트, 의존성·ruff·mypy 설정
- `Majung-Backend/app/main.py` -- FastAPI 진입점, CORS(localhost:8081), DI 와이어링
- `Majung-Backend/app/infrastructure/config/settings.py` -- BaseSettings: ANTHROPIC_API_KEY, 모델명
- `Majung-Backend/app/domains/chat/domain/` -- 6영역 정의, triage 규칙, 시스템 프롬프트(톤·환각금지 지시)
- `Majung-Backend/app/domains/chat/application/` -- ChatUseCase, Request/Response DTO
- `Majung-Backend/app/domains/chat/adapter/inbound/api/` -- POST /api/chat (SSE)
- `Majung-Backend/app/domains/chat/adapter/outbound/external/claude_client.py` -- Anthropic 스트리밍 클라이언트
- `Majung-Backend/app/domains/knowledge/data/institutions.json` -- 6영역×2~3 제도 (공개 데이터 초안)
- `Majung-Backend/app/domains/knowledge/` -- KB 로더·검색 (domain/application/adapter)
- `Majung-Backend/app/domains/centers/data/centers.json` -- 서울 서부 중심 기관 실데이터
- `Majung-Backend/app/domains/centers/adapter/inbound/api/` -- GET /api/centers
- `Majung-Backend/tests/` -- triage 픽스처(입력 3종), KB 폴백, centers 필터

## Tasks & Acceptance

**Execution:**
- [ ] `Majung-Backend/pyproject.toml` -- uv init + 의존성 고정 -- 재현 가능한 환경
- [ ] `app/infrastructure/config/settings.py` -- BaseSettings 구현 -- 키 단일 진입점
- [ ] `app/domains/knowledge/**` -- institutions.json 작성(공단·정부24·복지로·고용24 근거) + 로더/검색 -- 환각 금지의 원천
- [ ] `app/domains/centers/**` -- centers.json(서울서부지부·관할 주민센터·고용센터 공개정보) + GET /api/centers -- CAP-5 데이터
- [ ] `app/domains/chat/domain/**` -- 6영역·triage 규칙·시스템 프롬프트 -- CAP-2·3 핵심(순수 Python)
- [ ] `app/domains/chat/adapter/outbound/external/claude_client.py` -- 스트리밍 클라이언트 -- 외부 호출 격리
- [ ] `app/domains/chat/application/** + adapter/inbound/api/**` -- UseCase + SSE 라우터 -- 계약 준수(triage/text/card/error/done 이벤트)
- [ ] `app/main.py` -- 조립 + CORS + /api/health -- 기동점
- [ ] `tests/**` -- I/O 매트릭스 유닛테스트(Claude는 페이크 클라이언트로) -- 회귀 방지

**Acceptance Criteria:**
- Given .env에 키 설정, when `uv run uvicorn app.main:app --port 8000` 후 demo-scenario 입력 3종 POST, then 각각 기대 영역이 triage 상위에 포함된 SSE 스트림 수신
- Given KB에 없는 주제 질문, when POST /api/chat, then 제도 카드 0개 + 상담사 연결 폴백 문구
- Given 서버 로그 검사, when 위 요청들 처리 후, then 사용자 입력 원문이 로그에 부재

## Design Notes

- SSE 이벤트 계약(프론트와 공유): `event: triage` data=`{"areas":[{"key","label","rank","reason"}]}` → `event: text` data=`{"delta"}` → `event: card` data=`{"institution_id","name","how","where","docs","next"}` → `event: done` / `event: error` data=`{"message"}`
- triage는 Claude 호출 1회로 구조화 출력(tool use) + 안내 텍스트 생성까지 — 지연 최소화. KB 카드는 서버가 institutions.json에서 매칭해 붙임(모델이 카드 내용을 지어내지 않음)
- **"약사 모델" 분리**: 대화(말풍선)는 Claude 자유 — 공감·일상·후속질문 제약 없음. KB 제약은 **제도 사실 주장(카드)에만** 적용
- **상담사 연결 3단계 정책**: ①KB 밖 일상 대화 → 그냥 대화 ②KB 밖 제도 질문 → "정확한 정보 없음" 정직 안내 ③위기 신호·직접 요청·동일 요구 반복 → 이때만 상담사 연결 (시스템 프롬프트에 명시)
- **멀티턴 무저장**: 요청 body `history: [{role, content}]` (클라이언트가 세션 대화 보관, 최근 ~20턴 상한). 서버는 Claude 전달 후 즉시 폐기 — 서버에 대화 기록 0. 앱 재시작 시 초기화(예선). 본선에서 기기 로컬 암호화 저장 여부 결정
- institutions.json 스키마: `{id, area(6영역 key), name, summary_easy, where, docs[], next_step, deadline?, source_url}`

## Verification

**Commands:**
- `cd Majung-Backend && uv run ruff check . && uv run mypy app/` -- expected: 에러 0
- `uv run pytest` -- expected: green (triage 픽스처 3종 포함)
- `uv run uvicorn app.main:app --port 8000` + `curl -N -X POST localhost:8000/api/chat -H 'Content-Type: application/json' -d '{"message":"잘 곳이 없어요"}'` -- expected: triage→text→card→done SSE 순서 수신
