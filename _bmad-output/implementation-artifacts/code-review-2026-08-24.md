# 코드 리뷰 — 백엔드 2026-08-23-24 작업분

- **대상**: `freedom-backend` `130c679~1..3f0f5b5` — 커밋 41개 · 110파일 · 9,865줄
- **기준**: `spec-majung-2nd/majung365_리뉴얼_개발플로_기획안_v2.md` 외 계약 문서
- **층**: Blind Hunter · Edge Case Hunter · Acceptance Auditor (셋 다 완료)
- **검증**: 아래 ✅ 표시는 배포 서버 또는 실제 코드 실행으로 확인한 것

---

## 높음 — 시연 전에 고쳐야 하는 것

### H1. 개인정보 동의 없이 가입이 완료된다 ✅

```
POST /api/signup  consents: []                        → 200  저장 완료
POST /api/signup  consents: [{privacy, agreed:false}] → 200  저장 완료
```

`_crime_consented`는 죄목 동의만 봅니다. **필수 동의(privacy)를 확인하는 코드가 없습니다.**
동의 없이 이름·생일·출소날짜를 암호화 저장하는 것은 §3.1·§9의 근간을 어깁니다.

`app/domains/account/adapter/inbound/api/router.py:110-131`

### H2. 마스킹이 상담의 핵심 단어를 이름으로 지운다 ✅

```
"저 백수인데 일자리 있을까요"   → "저 [이름]인데 일자리 있을까요"
"저는 노숙인데 갈 곳이 없어요"  → "저는 [이름]인데 갈 곳이 없어요"
"저 신용불량인데 대출 되나요"   → "저 [이름]인데 대출 되나요"
"제 이름은 없어요"             → "제 이름은 [이름]"
```

백(白)·노(盧)·신(申)이 성 목록에 있고 `_WEAK_INTRO`가 "인데"로 끝나는 서술을 이름으로 잡습니다.
**모델에 가는 것은 마스킹된 쪽**이라 R6(취업)·R1(숙식)·R14(빚) 판정의 유일한 근거가 사라집니다.
마스킹 강화가 답변 품질을 떨어뜨리는 방향으로 작동하고 있습니다.

`app/infrastructure/security/masking.py` `_WEAK_INTRO` · `_STRONG_INTRO`

### H3. 서버가 UTC 날짜로 "오늘"을 판단한다 ✅

```
한국 시각 2026-08-24 05:01 / UTC 2026-08-23 20:01

release_date = 2026-08-24 (한국 날짜로 오늘) → 400 "출소날짜를 다시 확인해 주세요."
출소 경과일  서버 22일 · 실제 23일째
하루 상한    UTC 자정에 리셋 — "내일 이어서" 안내와 어긋남
```

`ZoneInfo`가 레포 전체에 한 번도 없습니다. **A 쐐기 프레임(출소 당일 시설 내 가입)이 새벽에 막힙니다.**

`account/.../router.py:146,187` · `account/.../deps.py:50` · `visit/domain/limits.py:_sent_on`

### H4. 대화 저장 키와 조회 키가 다르다 ✅

```
POST /api/chat   route_id "r8"  → "r8" 방에 저장
GET  /api/chat/R8               → 0건
GET  /api/chat/r8               → 2건
```

`_to_command`가 `strip().upper()` 하는데 저장은 `body.route_id` 원문을 씁니다.
경로 파라미터에 검증이 없어 임의 문자열이 방 키로 쌓이고 지울 수도 없습니다.

`chat/adapter/inbound/api/router.py:91-95` vs `132`·`201`

### H5. 지난 대화를 최근이 아니라 가장 오래된 100건으로 준다

주석은 *"오래된 것부터 잘라내지 않고 최근 것을 준다"*인데 코드는 `.order(desc=False).limit(100)`입니다.
**100건을 넘긴 사용자는 방을 열 때마다 맨 처음 대화만 봅니다.** 저장을 결정한 이유(§6.3)가 무효가 됩니다.
같은 레포의 방문 채팅은 `desc=True` 후 재정렬로 맞게 되어 있습니다.

`chat/infrastructure/message_repository.py:56-66`

### H6. 카드에서 연 대화가 사용자가 말한 상태를 되돌린다

`_pin_route`가 `RoutePriority(route=pinned)`를 새로 만들며 `state`를 기본값으로 되돌립니다.
R10 카드에서 "통장이 압류돼서 못 써요" → triage는 `BLOCKED`인데 핀이 `X`로 덮어써
**"계좌를 새로 만드세요"** 계열 카드가 나갑니다. `RoutePriority.state`를 도입한 이유가 그 시나리오였습니다.

`chat/application/usecase.py:203-206` — `state=p.state` 보존으로 해결

### H7. 시간을 조율해 놓고 확정하면 거절된 1지망으로 확정된다

`RESCHEDULE_PROPOSED → CONFIRMED`에서 `confirmed_for`가 없으면 `preferred_at_1`로 채웁니다.
**그 상태에 이른 이유가 1지망이 안 된다는 것**인데 그 시각으로 확정됩니다. 프론트가 이제 값을 보내
현재는 우회되지만, 폴백 자체가 조용히 틀린 값을 넣는 통로입니다.

`visit/application/usecase.py:148-152`

---

## 중간

### M1. 시군구를 부분 문자열로 비교한다 ✅

```
district_matches("남구","강남구") = True    ("동구","성동구") = True
district_matches("서구","강서구") = True    ("북구","강북구") = True
```

`sido` 없이 부르면 부산 남구 센터가 강남구 사용자에게 1순위로 나갑니다.
246곳이 걸러지던 문제의 **반대 방향**입니다.

`centers/domain/region.py:88-92`

### M2. 시도 필터의 `or matched` 폴백이 전국 목록을 되살린다

그 시도에 기관이 없으면 필터 결과가 비고 `or matched`가 246곳을 되돌립니다.
rank가 이름 가나다순으로 떨어져 제주 사용자에게 "강남구 정신건강복지센터"가 1순위가 됩니다.

`centers/infrastructure/support_institution_repository.py:76`

### M3. 담당자 로그인이 응답 시간으로 아이디 존재를 알려준다

docstring은 *"응답도 rate limit도 같다"*인데 `found is None or not verify_password(...)`의
단축 평가로 **없는 아이디는 scrypt(32MB)를 아예 돌리지 않습니다.**

`staff/adapter/inbound/api/router.py:69`

### M4. 담당자 채팅 입장·열람이 감사 로그에 남지 않는다

`_log`는 `staff_inbox`와 `act`에서만 불립니다. 소켓 `join`은 `room_for_staff`로 남의 대화 전체를
읽으면서 기록을 남기지 않습니다. **방이 기관 단위로 열리므로** 같은 기관 담당자가 임의 `visitId`로
들어가 읽을 수 있고 흔적이 없습니다. `0003_staff_account.sql`은 `action` 값에 `chat`을 적어 두었습니다.

### M5. 시간대 없는 datetime이 오면 500이 난다

`preferred_at_1: datetime`에 tz 강제가 없어 naive가 통과하고 `preferred_at_1 <= now`에서
`TypeError`가 납니다. 400이 아니라 500입니다. `confirmed_for`·`proposed_at`은 검증 없이 저장됩니다.

### M6. 확정 정보가 상태를 바꿔도 남는다

`CONFIRMED → RESCHEDULE_PROPOSED`·`CANCELLED` 뒤에도 `confirmed_for`·`meeting_place`가 지워지지
않고 그대로 내보내집니다. 화면에 "다른 시간을 제안했어요"와 이전 확정 시각이 함께 붙습니다.

### M7. 담당자 둘이 같은 요청을 동시에 처리하면 둘 다 통과한다

`by_id → can_move → update_status` 사이에 잠금이 없습니다. 확정과 취소가 모두 전이 검사를 통과해
확정 알림을 받은 사용자가 창구에 갔는데 요청은 취소 상태일 수 있습니다.
가드: `update_status`에 `.eq("status", current.status.value)`.

### M8. `share_consented`가 요청 본문의 불리언 하나다

저장된 `user_consent`와 대조하지 않습니다. 동의 기록이 없어도 `consented_at`이 찍혀
**동의를 받은 것처럼 보이는 기록**이 남습니다. `CONSENT_KINDS`의 `"share"`가 이 경로에서 안 쓰입니다.

### M9. `datetime.now()`가 타임존 없는 시각이다

같은 파일의 다른 자리는 `utcnow()`(aware)인데 이 둘만 naive라 `+00:00` 없는 문자열이 DB로 갑니다.

`visit/infrastructure/supabase_repository.py:227,234`

### M10. 가입에 채팅용 rate limit(20회/분)이 붙어 있다

담당자 로그인은 10회/분인데 **저장을 발생시키는 가입이 더 느슨합니다.** 게이트를 폐지해
다른 확인 절차도 없고, 자동 파기 배치가 없어 정리 경로도 없습니다.

---

## 낮음 · 죽은 코드

- `_SIDO_ALIASES`의 `"강원특별자치"`·`"제주특별자치"`는 도달 불가 ✅ — 접미사가 먼저 잘림
- `SessionRepository.resolve(token, today)`의 `today` 인자를 본문에서 안 씀
- `user_session.last_used_on` 컬럼을 아무도 읽고 쓰지 않음
- `deleted_at`은 읽기만 하고 세팅하는 코드가 레포에 없음 — 마이그레이션이 적은 2단계 삭제가 미구현
- `migrations/0001_user_and_crime.sql:75` 주석의 동의 종류가 `crime_category` (코드는 `crime`)
- `tests/test_session_auth.py:138` — `assert hasattr(Request,"app")`로 아무것도 검증하지 않음
- `clientMsgId`에 길이 제한 없음
- 한 음절 검색어(`빚`·`돈`·`집`·`약`)가 색인·질의에서 버려짐
- `centers` 저장소가 모듈 최상단 인스턴스라 데이터 검수 실패가 `/api/health`까지 죽임

---

## 운영·문서

- `DEPLOY.md`가 시연 계정이 `0003_staff_account.sql`에 있다고 적었으나 그 파일에 `insert`가 없음.
  **담당자 계정을 재현 가능하게 만드는 경로가 레포에 없음**
- 게이트 복구 경로(`DEMO_ACCESS_CODE_HASH`)를 켜면 프론트가 토큰을 실을 자리가 없어 전원 401
- 보관 기간 파기 배치 미구현 → `deferred-work.md`에 이월

---

## 기각한 것

- **죄목 철회가 조용히 무시된다** — `crime_repo`·`account_repo`·`session_repo`가 `main.py`의 같은
  블록에서 함께 세팅됩니다. 계정이 있으면 저장소도 있어 도달 불가하고, 실패는 500으로 드러납니다.
- **지부 필터가 접근 통제를 안 한다** — docstring이 이미 *"필터를 켜도 지금 데이터로는 걸러지지
  않는다 — 구조만 두고 지역 정보가 생길 때 붙인다"*고 명시합니다. 의도된 미구현입니다.
  다만 `GET /api/staff/me`가 `branch_filter_on`을 내보내는 것은 오해를 부를 수 있습니다.

---

## 계약 대조 (Acceptance Auditor)

**전제**: 문항 정의는 백엔드에 없다. 백엔드는 규칙표(`intake_rules.json`)만 들고 있고
문항·선택지·꼬리질문 조건은 `Majung-Frontend/src/features/intake/domain/questions.ts`가 유일한 자리다.

### F1 [높음] R4 주거지원이 R1 숙식제공과 같은 카드를 낸다 ✅

```
전부 X일 때   R1 → housing-koreha-residence
             R4 → housing-koreha-residence   ← 같은 카드
             R2 → welfare-emergency-support
```

`shelter` 노드 하나가 `route_ids: ["R1","R4"]`로 두 항목을 겸한다. 경로 둘의 미충족 개수가
같아 먼저 선언된 쪽이 뽑히고, `institutions.json`이 R4의 대표로 선언한 `housing-koreha-rental`은
**어떤 경로로도 도달하지 않는다.**

부팅 검사 `_validate_graph_refs`가 못 잡는다 — 노드와 제도의 `route_ids`가 **한 칸이라도
겹치면** 통과시킨다. 경로 단위로 봐야 걸린다.

### F2 [높음] R2에서 공단 긴급지원이 사라지고 129만 나간다 ✅

```
welfare-koreha-emergency    lead_for: ["R2"]        공단 1670-7004  ← 선언된 대표
welfare-emergency-support   companion_for: ["R2"]   정부 129        ← 실제로 나가는 것
```

그래프가 선언을 덮어써 동반이 대표가 되고, 대표와 같은 id는 동반에서 빠져 공단 제도가
카드에서 완전히 사라진다. `entity.py`의 `companion_for` 주석이 *"R2는 둘 다 보여줘야 한다"*고
적어 둔 자리다. Q2-1의 "공식 지원내용"이 전부 공단 기준인데 그 답으로 나가는 카드는 정부 제도다.

**F1·F2·F6의 뿌리는 하나다.** `kb_ref_for_route`가 "한 항목에 노드가 둘"은 방어하는데
"한 노드가 항목 둘"은 방어하지 않는다. 경로마다 어느 항목의 경로인지 데이터에 적고
`_select_path`가 항목으로 먼저 거르면 셋이 함께 풀린다.

### F6 [중] R4가 다른 항목의 선행조건으로 표시된다

`routes_blocking_others`가 선행조건 노드의 `route_ids`를 전부 펼쳐 R1뿐 아니라 R4까지
자물쇠 표시를 받는다. `graph-design.md` §3.1의 선행조건은 "잘 곳"이지 "오래 살 집"이 아니다.

### F3·F4 [문서] 계약이 정본 노릇을 못 하고 있다 — 코드 문제가 아님

계약은 27문항(필수 14 + 꼬리 13)인데 구현은 25다. `Q2-1-1`·`Q2-1-2`가 없고 Q2-1 선택지 셋이
빠졌다. Q1-2·Q5-2는 다른 문항으로 대체됐고 `NOT_NEEDED`가 다섯 문항에 신설됐다.

**프론트와 백엔드 규칙표는 서로 맞아 있어 런타임 오작동은 없다.** 어긋난 상대가
`intake-questions.md`다. 결정 근거가 `decision-log`·`SSOT`·기획안 어디에도 없고 미추적 파일
`questions-review.md` 하나에만 있다. 간략화 판단 자체는 타당해 보이므로 **코드를 되돌리기보다
계약을 갱신하는 쪽**이 맞다.

### F5 [중] Q1-1-1 노출 조건이 계약보다 좁다 — 의도된 변경으로 보임

계약은 `NO_PLACE_TONIGHT` 또는 `TEMPORARY_UNSTABLE`인데 구현은 후자만이다. 근거 주석이
바로 위에 있어 판단은 타당하다. 계약에 반영만 하면 된다.

### F7 [중] 연락처 계약이 문서끼리 어긋난다

- R6 국민취업지원제도 1350 — `lead_for`·`companion_for`가 둘 다 비어 도달 불가
- R15 의료급여 129 — 동반 제도 없음
- **R8** — `route-contacts.md` §1은 공단 1670-7004를 기본으로, 1577-0199를 조건부로 두는데
  `graph-design.md` §3.2는 `mental_care`를 "정신건강복지센터 1577-0199"로 정의한다.
  코드는 후자를 따랐다. **어느 쪽이 정본인지 정해야 한다.**
- R2·R8·R14의 조건부 번호가 조건과 무관하게 항상 붙는다 — 동반 목록에 조건을 담을 자리가 없다

### 깨끗했던 것

```
RouteId        R1~R4·R6~R15 14개 · R5 결번 유지 · 6분야 대응 한 칸도 안 어긋남
그래프 데이터   노드 12개 · 엣지 confirmed 6 / assumed 9 — graph-design.md §6과 일치
               폐기 노드(phone·job_national) 없음 · deadline V-3 정정 반영됨
NodeState      O/X/BLOCKED/UNKNOWN 네 값 · JSON에 글리프 없음
대표 선정 규칙  §5 검증 케이스 3건 실행 3/3 일치
규칙표 vs 그래프 기본은 그래프가 이기고 꼬리질문을 본 규칙만 앞선다 — 테스트 셋이 고정
연락처         사람이 적은 상수 11개뿐 · 본문 자동 추출 코드 없음
kb_ref 무결성  dangling 0건 · 부팅 검사와 테스트가 고정
```
