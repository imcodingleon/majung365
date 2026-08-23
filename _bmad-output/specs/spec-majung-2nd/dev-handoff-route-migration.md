# 개발 인계 — 6영역 제거와 지원 항목 전환

> 작성일: 2026-08-23
> 작성 세션: `freedom-project-d1` (RAG 수집 · 문항 구조 담당)
> 대상: 이 마이그레이션을 구현할 개발 세션
> 상태: **설계 확정. 코드는 아직 손대지 않았다**

---

## 0. 먼저 읽을 문서

| 순서 | 문서 | 무엇이 들어 있나 |
|---|---|---|
| 1 | `_bmad-output/specs/spec-majung-2nd/intake-contract.md` | 용어 정의, 6분야 ↔ 14개 지원 항목, 폐기 항목 |
| 2 | `_bmad-output/specs/spec-majung-2nd/intake-questions.md` | 문항 세트 전문 (필수 14 + 꼬리 13) |
| 3 | `_bmad-output/specs/spec-majung-2nd/route-contacts.md` | 지원 항목별 담당 기관 연락처 |
| 4 | `majung365_리뉴얼_개발플로_기획안_v2.md` (같은 폴더) | 제품 기획 정본 (다른 세션이 관리 중) |
| 5 | `_bmad-output/specs/spec-majung-2nd/SSOT.md` | 개발 계약 상위 문서 (7월 30일 자, 갱신 필요) |

**문서 관계:** `SSOT.md`가 개발 계약의 상위 문서이고 위 1~3이 그 하위다. 같은 사안에서 충돌하면 **날짜가 늦은 결정이 이긴다**(리뉴얼 기획안 8월 17·23일 > `SSOT.md` 7월 30일). 이건 임시 규칙이며, `SSOT.md`의 대체된 항목을 새 계약을 가리키게 고치면 필요 없어진다.

`HANDOFF.md`와 `TEAM-SUMMARY.md`는 7월 30일 시점 기록이라 현재와 맞지 않는다.

---

## 1. 무엇을 바꾸나

**6영역(`identity`·`welfare`·`housing`·`employment`·`health`·`debt`)을 완전히 걷어내고 지원 항목 14개로 간다.**

바꾸는 이유는 두 가지다. 첫째, 라우팅과 정렬 단위가 지원 항목으로 바뀌었다. 둘째, **한 근거 문서가 여러 항목에 걸치므로 단일 `area` 문자열로 표현할 수 없다.** 예를 들어 `보건복지부 2026 선정기준`은 R12와 R15 양쪽의 근거다.

### 지원 항목 14개

식별자는 `R1~R4`와 `R6~R15`다. **R5(가족지원)는 폐기했고 번호는 결번으로 남긴다.** 다시 매기면 `15개 질문` 기획서의 모든 참조가 어긋난다.

| 분야 | 지원 항목 |
|---|---|
| 1 주거 | R1 숙식제공 · R4 주거지원 · R11 주민등록 주소 |
| 2 생계·긴급비용 | R2 공단 긴급지원 · R12 생계급여 |
| 3 신분·행정 | R9 신분증 · R10 통장 |
| 4 취업·직업 | R6 취업·허그일자리 · R7 창업지원 |
| 5 건강·심리 | R3 기초건강지원 · R8 심리상담 |
| 6 기타·권리구제 | R13 수용·출소증명서 · R14 개인회생·파산 · R15 의료급여·건강보험 |

### 함께 폐기하는 것

- **그래프 노드 `phone`(본인 명의 휴대폰)** — 사용자가 앱을 쓰고 있다는 것 자체가 휴대폰이 있다는 뜻이다. 다만 통장 개설의 선행조건은 정확히는 *본인 명의* 휴대폰이므로, **R10 결과 카드의 준비물 안내에는 본인 명의 확인이 들어가야 한다**
- **그래프 노드 `job_national`(국민취업지원제도)** — 지원 항목으로는 폐기하되 R6의 근거 문서로는 수집해 두었다

---

## 2. 작업 범위와 순서

**이 정리가 `source_url`·`fetched_at`을 API에 싣는 작업보다 앞선다.** KB 데이터 스키마 자체가 바뀌므로, 먼저 확정하지 않으면 API 응답 형태를 두 번 고치게 된다.

| 대상 | 처리 |
|---|---|
| 백엔드 `Area` enum | 삭제 후 교체 |
| KB 데이터 2종 | `area` 문자열 → `route_ids` 배열 |
| 프론트 | 계약이 깨지지 않을 만큼만 |
| 화면 개편 (6분야 박스·R탭 결과 카드) | **하지 않는다. 기획 확정 후** |

---

## 3. 코드 조사 결과 — 손댈 곳 전부

`Area` 참조는 **45곳, 파일 9개**다. 조사는 끝냈으니 다시 찾을 필요 없다.

### 백엔드 (`Majung-Backend/app/`)

| 파일 | 지금 | 바꿀 것 |
|---|---|---|
| `domains/shared/areas.py` | `Area` StrEnum 6종 + `AREA_LABELS` + `label_for()` | **삭제.** `routes.py`로 대체 |
| `domains/knowledge/domain/entity.py` | `Institution.area: Area` | `route_ids: tuple[RouteId, ...]` |
| `domains/knowledge/domain/repository.py` | `by_area(area)` | `by_route(route)` |
| `domains/knowledge/infrastructure/json_repository.py` | `area=Area(row["area"])` | `route_ids=tuple(...)` 파싱 |
| `domains/chat/domain/triage.py` | `AreaPriority.area: Area` | `RoutePriority.route: RouteId` |
| `domains/chat/domain/prompts.py` | `area_display()`, `label_for(p.area)` | 항목 라벨로 교체 |
| `domains/chat/application/dto.py` | `AreaOut`, `TriageEvent.areas`, `CardData.area_label` | `RouteOut`, `.routes`, `.route_label` |
| `domains/chat/application/usecase.py` | `_to_area_out()`, `by_area(p.area)` | 대응 교체 |
| `domains/chat/adapter/outbound/external/claude_client.py` | 도구 스키마 `"enum": [a.value for a in Area]` | 항목 14개 enum |
| `domains/chat/adapter/inbound/api/router.py` | SSE `{"areas": [...]}`, `"area_label"` | 필드명 교체 |
| `domains/knowledge/domain/graph_engine.py` | `area: str` (58행) | `route_ids: tuple[str, ...]` |
| `domains/knowledge/infrastructure/graph_repository.py` | `area=str(row["area"])` (46행) | 대응 교체 |

### 새로 만들 `domains/shared/routes.py`

`areas.py`를 대체한다. 담을 것은 다음과 같다.

- `RouteId` StrEnum — `R1~R4`, `R6~R15` (R5 결번을 주석으로 명시)
- `SectionId` StrEnum — 6분야. **`S1~S6`처럼 옛 영역 코드와 겹치지 않는 값을 쓸 것.** `identity`·`health` 같은 문자열을 재사용하면 옛 데이터가 조용히 통과해 버그를 숨긴다
- `ROUTE_LABELS`, `SECTION_LABELS`, `ROUTE_SECTION` 매핑
- `label_for()` 대응 함수

### 데이터

| 파일 | 지금 | 바꿀 것 |
|---|---|---|
| `domains/knowledge/data/institutions.json` | 16건, 각 `"area": "identity"` 등 | `"route_ids": ["R9", "R11"]` |
| `domains/knowledge/data/graph.json` | 노드 14개, 각 `"area"` + `"tier"` | `route_ids`. `phone`·`job_national` 노드 삭제 |

**`graph.json`을 고치면 `graph-design.md`도 같은 작업으로 갱신해야 한다.** `graph.json`이 `_meta.source`에 그 문서를 자기 출처로 명시하고 있어서, 데이터만 고치면 나중에 왜 이렇게 되어 있는지 추적할 수 없다.

### 프론트 (`Majung-Frontend/src/`) — 8파일

`AreaOut`이 챗 기능 전체로 퍼져 있다. 전수 조사로 확인한 목록이다.

**SSE·타입 계약 미러 6개**

| 파일 | 무엇이 걸리나 |
|---|---|
| `shared/types/api.ts` | `AreaOut` 정의(5행) · `CardData.area_label`(21행) · `onTriage` 시그니처(147행) · `VoiceResult.area` |
| `shared/types/index.ts` | `AreaOut` 재수출(3행) |
| `shared/utils/api.ts` | SSE 파서가 `(parsed as { areas: AreaOut[] }).areas`로 읽음(186행) |
| `features/chat/domain/message.ts` | triage 메시지 타입의 `areas: AreaOut[]`(8행) |
| `features/chat/hooks/useChat.ts` | `onTriage: (areas: AreaOut[])`(65행), 메시지 생성(68행) |
| **`features/chat/views/MessageViews.tsx`** | **`TriageBanner`가 `area.key`·`label`·`rank`·`reason`을 직접 렌더(50~51행, 131행)** |

**id 값 2개**

| 파일 | 지금 |
|---|---|
| `features/home/domain/services.ts` | 서비스 항목 id가 `identity`·`housing`·`welfare`·`employment`·`debt` |
| `shared/components/DesktopShell.tsx` | 아이콘 매핑 `IC.identity` 등 |

이 둘은 타입이 아니라 문자열 id와 아이콘 경로라 `Area` enum과는 별개 축이다.

**가장 조심할 곳은 `MessageViews.tsx`다.** `TriageBanner`가 `rank`로 정렬해 `key`·`label`·`reason`을 화면에 직접 그린다. **타입만 바꾸고 렌더링을 두면 타입 검사는 통과하는데 화면이 빈다.** 컴파일 오류로 잡히지 않으므로 실행해서 확인해야 한다.

**SSE 필드명을 바꾸면 프론트가 함께 깨진다.** 백엔드와 프론트를 같은 커밋에서 고쳐야 한다.

### 아이콘

`assets/images/home/`과 `assets/images/roadmap/task/`에 같은 이름으로 6개씩, 모두 12개가 있다.
**로드맵 화면은 5탭 구조 전용이라 폐기 대상이므로 `home/` 세트만 남는다.**

**아이콘이 필요한 곳은 초기 진단의 6분야 박스뿐이다.** 홈 화면의 할 일 카드는 아이콘이 아니라 색 인덱스 탭으로 구분한다. 지원 항목 14개용 아이콘은 쓸 자리가 없다.

기존 6개 중 다섯은 새 6분야에 그대로 대응한다(`housing`→주거, `welfare`→생계, `identity`→신분, `employment`→취업, `health`→건강). **`debt` 하나만 의미가 넓어져(채무 → 기타·권리구제) 새로 만들어야 한다.**

이번 코드 정리에서는 **기존 6개를 항목별로 매핑해 재사용한다.** R9·R10·R11·R13이 `identity.png`를 공유하는 식이며, 아이콘이 겹치는 것은 임시 조치다.

---

## 4. 검증

```bash
cd Majung-Backend
uv run ruff check .
uv run mypy app/
uv run pytest
```

`tests/`에 8개 파일이 있고 `test_triage_integration.py`·`test_knowledge_centers.py`·`test_graph_engine.py`가 이 변경에 직접 걸린다. `fakes.py`도 함께 고쳐야 한다.

프로젝트 규칙상 **코드 수정 후 `ruff check`와 `mypy` 에러 0을 확인**해야 한다.

---

## 5. 이 작업 뒤에 오는 것

`source_url`과 `fetched_at`을 API 응답에 싣는 작업이다. AI 답변 ①단계에 출처와 확인 날짜를 표시하기 위해 기획서 §6.4가 요구하고 있다.

RAG 수집 산출물은 `tools/rag-crawler/output/documents.jsonl`에 있다. **72건, 본문 합계 148,621자**이고 문서마다 `source_url`·`fetched_at`·`route_ids`·`content_hash`를 가진다. 수집기 사용법은 `tools/rag-crawler/README.md`에 있다.

**`fetched_at`은 우리가 수집한 날짜이지 기관이 문서를 갱신한 날짜가 아니다.** 화면에 "2026년 8월 23일 기준"처럼 적으면 기관이 그날 확인했다는 뜻으로 읽히므로, 마중365가 확인한 날짜라는 것이 드러나는 문구를 써야 한다.

---

## 6. 주의

- **문항 문구와 `optionId` 값은 기획 검토 중이다.** 코드에 고정값으로 박지 않는다
- **정부24는 신청 화면 계열 3건에서 자동 수집을 차단한다.** 우회하지 않는다. 수집기는 경고만 남긴다
- 웹 검색 화이트리스트는 **RAG 근거 26개, 웹 검색 24개**로 갈래가 다르다. 지자체 2곳(`gb.go.kr`·`songpa.go.kr`)은 근거로만 쓰고 검색 대상에서 뺀다
- 개인정보 저장·로그 금지 원칙은 그대로다. 대화 내용을 서버에 영속화하지 않고 로그에 사용자 입력 원문을 남기지 않는다
