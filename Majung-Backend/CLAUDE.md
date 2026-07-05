# CLAUDE.md — Majung-Backend

[마중365] 백엔드. FastAPI — triage(6영역)·제도 매칭 안내·센터 데이터 API. HailMary-Backend 헥사고날 컨벤션의 **경량판** (예선: DB 없음).

## Tech Stack

| 항목 | 선택 |
|---|---|
| 언어 | Python 3.12+ (uv) |
| 프레임워크 | FastAPI |
| 검증 | Pydantic v2 |
| AI | Claude API (SSE 스트리밍) |
| 저장소 | 예선: JSON 파일 지식베이스 (`app/domains/knowledge/data/`). DB 없음 — 본선에서 MySQL+SQLAlchemy 도입 |
| 배포 | Vercel (FastAPI 네이티브 지원) |

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
│   ├── chat/                    # CAP-2·3: triage + 안내 생성
│   │   ├── domain/              # 6영역 분류 규칙, 프롬프트 (순수 Python)
│   │   ├── application/         # UseCase, Request/Response DTO
│   │   └── adapter/
│   │       ├── inbound/api/     # POST /api/chat (SSE)
│   │       └── outbound/external/   # Claude API 클라이언트
│   ├── knowledge/               # 제도 지식베이스
│   │   ├── data/institutions.json   # 6영역 × 2~3 제도 (예선 KB)
│   │   ├── domain/
│   │   ├── application/
│   │   └── adapter/inbound/api/     # GET /api/knowledge/...
│   └── centers/                 # CAP-5: 지원기관 (지도용)
│       ├── data/centers.json        # 서울 서부 중심 실데이터
│       └── adapter/inbound/api/     # GET /api/centers
├── infrastructure/
│   └── config/settings.py       # 환경변수 (Pydantic BaseSettings) — 유일한 진입점
└── main.py                      # FastAPI 진입점, DI 와이어링
```

레이어 의존성: `Adapter → Application → Domain`. 의존성은 항상 안쪽으로만.

## MUST 규칙 (HailMary 승계)

1. **Domain은 순수 Python** — FastAPI/httpx/Pydantic-외부API import 금지. 프롬프트는 `chat/domain/`에 (비즈니스 로직)
2. **환경변수는 `infrastructure/config/settings.py`에서만** — `os.environ` 직접 접근 금지
3. **Claude API 호출은 `adapter/outbound/external/claude_client.py`에서만**
4. **Router에 비즈니스 로직 금지** — 2줄 초과 분기는 UseCase로
5. **DTO 경유** — Domain Entity를 API Response로 직접 반환 금지
6. **코드 수정 후 `uv run ruff check . && uv run mypy app/` 에러 0 확인**
7. **개인정보 저장·로그 금지** — 익명 전제. 대화 내용을 서버에 영속화하지 않는다(예선). 로그에 사용자 입력 원문 남기지 않기
8. 유저 입력은 신뢰하지 않는다 — 프롬프트 인젝션 대비: 시스템 프롬프트에 역할 고정, KB 밖 제도명 생성 금지 지시

## 이 프로젝트 특수 규칙

- **정본 계약**: `../_bmad-output/specs/spec-majung-demo/` — SPEC.md(CAP·제약), demo-scenario.md(triage 기대 결과 = 테스트 픽스처)
- **안내 응답 형식**: 제도명 명시 + 어디서·무슨 서류·다음 단계. 쉬운 말 톤 규칙(demo-scenario.md) 준수 — 한 문장 = 한 지시
- **KB 밖 환각 금지**: 제도 안내는 `knowledge/data/` 내 항목만 인용. 없으면 "상담사 연결" 폴백
- Claude 모델: `claude-sonnet-4-6` (HailMary와 동일) — 데모 시연 안정성 우선
- API 실패 시 재시도 안내 문구 반환 (demo-scenario 리허설 체크 항목)
