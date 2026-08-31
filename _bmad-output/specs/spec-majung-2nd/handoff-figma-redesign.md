# 인수인계 — 피그마 시안 반영 (프론트엔드)

**작성일** 2026-08-31
**넘기는 쪽** 시안 반영 세션 (대화가 길어져 새 세션으로 넘긴다)
**받는 쪽** 이어서 작업할 프론트엔드 세션

---

## 1. 무엇을 하던 일인가

디자이너가 현재 마중365 UI를 개선한 시안을 피그마에 올렸고, **"최대한 비슷하게 만들어 달라"**는 요청이다.

- 파일 키 `WUhuKu9IUAk7TUXjVEfy6m`, 화면 프레임 19개
- 계획 문서: `C:\Users\skwog\.claude\plans\fuzzy-churning-lighthouse.md` (화면 ↔ 파일 매칭표가 여기 있다)
- 좌석이 **View 권한**이라 읽기만 된다. 이 작업은 읽기만 필요하다

### 사용자가 정한 것

| 항목 | 결정 |
|---|---|
| 글꼴 | Pretendard를 내려받아 싣는다 (**완료**) |
| 아이콘 | 피그마 SVG 원본의 path를 `Icon.tsx`로 옮긴다. 새 의존성 금지 |
| 문구 | 시안 문구를 그대로 따른다 |
| 어체 | 해요체 대화투 → **합니다체 고지투**로 전면 개편 (`copy-voice.md`가 정본) |
| 확인 방식 | 화면 하나를 끝낼 때마다 로컬 주소를 알려 눈으로 확인받는다 |

---

## 2. 어디까지 했나

### 끝난 화면

| 화면 | 파일 | 주요 변경 |
|---|---|---|
| 홈 | `features/tasks/views/` | 진행 표시, 카드, 체크 아이콘 |
| 알림 | `features/alerts/views/AlertListScreen.tsx` | 제목 바 가운데 정렬, 빈 상태 문구 |
| 채팅 내역 | `features/chat/views/ChatListScreen.tsx` | 제목 "채팅 내역", 시각·날짜 표시, 파란 배지 |
| AI 채팅 | `features/chat/views/ChatPopup.tsx` | 점 세 개 점멸 로딩, 말풍선 그림자·시각, 입력 바 |
| 방문 예약 시트 | `features/visit/views/VisitRequestSheet.tsx` | 라벨 전면 교체, 안심 상자, 분야 선택 |
| 방문 상태 띠 | `features/visit/views/RequestStatusStrip.tsx` | "신청이 접수됐어요", 시계 아이콘, 취소 버튼 오른쪽 |
| 생일 게이트 | `features/account/views/BirthGate.tsx` | 문구, 입력칸 62px, 삭제 카드 바로 표시 |
| 내 정보 | `features/account/views/MyInfoScreen.tsx` | 바꾸기 오른쪽, 보관 안내 상자, 구역 제목 |
| 지역 선택 | `features/institutions/views/RegionPicker.tsx` | 배너·검색창·4열 격자·선택 완료 |
| 지도 | `features/centers/views/MapScreen.tsx` | 지역 배지 + "지역 변경" 버튼 |

### 남은 화면 — **없다** (2026-08-31 갱신)

이 문서를 쓴 뒤에도 작업이 이어져 세 갈래가 모두 끝났다. 문서만 그 시점에 멈춰 있었다.

1. **가입 + 문항 팝업 + 날짜 선택 시트** — 끝남
   - 가입 `0d20a0b`, 날짜 입력 `50eea10`, 문항 팝업 `d108fa5`·`ac01c12`, 문항 어체 `59a989e`
   - 날짜는 **눌러서 고르는 대신 키보드로 적는 방식으로 바뀌었다** (디자이너 권고). 따라서 `PickerBox.tsx`는 이제 방문 시간에만 쓰인다
2. **긴급 연락처** — 끝남 (`14756e5`·`1f1482d`·`63220a2`)
3. **지도 카드 세부** — 끝남. 시안 `43:7364`의 값을 브라우저에서 재어 대조했고 **한 곳만 어긋났다**
   - 카드 그림자의 번짐이 4px이었다(시안 2px). `shadow` 한 마디에 맡겨 두어 생긴 차이라, `RegionPicker`가 쓰는 방식대로 인라인 style로 못 박았다
   - 나머지는 전부 일치했다 — 카드 408×172·여백 16·모서리 16·간격 8, 이름 16/24 SemiBold `#1d1b20`, 운영시간 14/20 Regular `#494551`, 태그 12/16 `#024f9f` 바탕 `#e1eefa`, 버튼 높이 46·모서리 12·사이 12·글자 14/20 Medium, 구역 제목 16/24 ExtraBold `#1c2333`, 곳 수 13/21 `#939393`
   - **거리 표시는 시안에 없지만 남겼다.** 지방에서 50km 떨어진 공단이 "가장 가까운 곳"으로만 보이면 전화로 먼저 물어볼지 판단할 수 없다

---

## 3. 반드시 지킬 작업 방식

이 세션에서 사용자에게 지적받고 굳어진 규칙이다.

### 눈으로 비슷하다고 판단하지 말고 **실측한다**

> "뭐가 같아 아래 채팅 박스 시안이 훨씬 앏구만 똑바로 안해?"

채팅 입력창을 "비슷하다"고 넘겼는데 실제로는 **74px 대 55px**이었다. 시안 코드에 값이 적혀 있으므로 대조하고, 브라우저에서 `boundingBox()`로 재서 확인한다.

```ts
const rect = await page.getByRole("textbox", { name: "질문 입력" }).boundingBox();
console.log(rect?.height);   // 시안 값과 대조
```

**그때 찾은 함정**: `multiline` TextInput은 웹에서 `<textarea rows=2>`가 되어 한 줄만 적어도 두 줄 높이를 잡는다. `numberOfLines={1}`을 함께 준다.

### 시안을 따르되, 따르지 않을 때는 근거를 남긴다

- 방문 예약 시트의 체크 항목: 시안은 **동그라미**로 그렸지만(레이어 이름이 `Radio Button`으로 남아 있다) 여러 개를 고르는 자리라 **네모를 유지**했다
- 채팅 시각: 시안의 "방금 전"은 1분이 지나도 그대로 남아 틀린 말이 되므로 넣지 않았다

### 보안 규칙과 충돌하면 사용자에게 묻는다

방문 예약 시트의 "담당자에게 이만큼만 알려줘요" 목록(§7.4 최소 노출 고지)을 시안이 안심 문장으로 대체했다. **물었고 사용자가 "시안 그대로"를 택했다.** 이런 자리는 임의로 정하지 않는다.

---

## 4. 검증 기반

이 세션에서 새로 만들었다. **화면을 고치면 반드시 돌린다.**

```bash
cd Majung-Frontend
npm run e2e        # 화면 검증 (Playwright, e2e/*.spec.ts)
npm test           # 계산 검증 (jest, *.test.ts)
npx tsc --noEmit   # 타입
```

- 확장자를 갈라 두어(`.spec.ts` ↔ `.test.ts`) jest와 Playwright가 서로의 파일을 집어가지 않는다
- 서버 응답은 `e2e/support/app.ts`가 가짜로 채운다. 새 API를 쓰는 화면을 만들면 여기에 분기를 더한다
- 진짜 서버에 붙는 것은 `e2e/smoke.spec.ts` 하나뿐이다 (`E2E_TOKEN` 없으면 건너뛴다)

### e2e에서 반드시 알아야 할 함정 셋

1. **시계를 고정하면 애니메이션이 멈춘다.** React Native의 `Animated`가 흐른 시간을 `Date.now()`로 재기 때문이다. 팝업·시트가 열리는 화면은 `openApp(page, path, { freezeClock: false })`
2. **말일에 돌리면 이번 달에 고를 날이 없다.** 방문 예약은 당일을 막으므로, 날짜를 못 박지 말고 `[role="radio"]:not([aria-disabled="true"])`로 고를 수 있는 첫 값을 잡는다
3. **개발 서버가 오래 돌면 HTML 응답이 28초까지 늘어진다.** 번들은 정상인데 HTML만 느리다. 이럴 때는 서버를 재시작한다 (0.2초로 돌아온다)

---

## 5. 이 세션에서 e2e가 잡아낸 결함 (참고)

화면을 고치는 김에 찾은 것들이다. 같은 종류가 더 있을 수 있다.

| 결함 | 자리 |
|---|---|
| 방금 온 메시지 알림이 **요청을 보낸 날짜**에 묻힘 | `alerts/domain/alert.ts` — `at`을 `lastMessageAt`으로 |
| "9시**은** 어떠신지" — 받침을 안 보고 조사를 박음 | 같은 파일 — `josa()` 사용 |
| 채팅 목록에 날짜가 없어 닷새 전 대화가 오늘로 읽힘 | `shared/utils/time.ts`의 `listWhenLabel` |
| **시·도만 고르면 지도가 "불러오는 중"에서 멈춤** | `centers/hooks/useNearbyCenters.ts` — `district` 없이도 부르게 |
| 필터 칩·전화·길찾기에 `accessibilityRole`이 없어 낭독기가 버튼으로 못 읽음 | `centers/views/MapScreen.tsx` |

---

## 6. 아직 열려 있는 것

1. **알림과 채팅의 시각 형식이 다르다.** 알림은 "오전 5시 40분", 채팅은 "오전 05:40". 시안이 채팅만 정했고 사용자가 "각자 그대로 둠"을 택했다. 나중에 통일할지 다시 물을 수 있다
2. ~~**`useNearbyCenters`가 시·군·구 없이 부를 때 서버가 어떻게 답하는지 확인하지 않았다.**~~ **확인했고 서버를 고쳤다** (2026-08-31)
   - 확인해 보니 서버가 그 경우를 받지 않고 있었다. `GET /api/centers`가 `sido`와 `district`가 **둘 다** 있어야 지도 자료로 들어갔고, 시·도만 오면 수도권 다섯 곳이 담긴 `centers.json`으로 빠졌다
   - 오류가 아니라 **엉뚱한 답이 나오는 형태였다.** 지역 선택에서 "부산"만 고른 사용자가 "센터 위치 정보 부산" 배지 아래에서 서울 지부 목록을 받았다. 그것을 보고 찾아가면 헛걸음이다
   - 고친 자리는 둘이다 — `centers/adapter/inbound/api/router.py`가 `sido`만 있어도 지도 자료를 쓰게 했고, `map_repository.by_region`이 시·군·구가 비면 그 시·도 전체를 그 지역으로 보게 했다. 갈래마다 셋에서 자르는 규칙은 그대로다
   - 검증: `tests/test_map_origin.py` 세 건 + `tests/test_api_smoke.py` 한 건
   - **배포본에는 아직 안 들어갔다.** 아래 4번과 같은 처지다
3. **RAG 자료 확인이 필요한 항목 여섯 가지**가 앞선 대화에서 사용자에게 보고된 채 남아 있다 (R2 긴급지원 데이터 모델, R9 사진 규격, R10 통장 구분, R4 주거 체크리스트 혼재, R6 허그일자리 빈약, R3·R7 체크리스트)
4. **`institutions.json`·`graph.json` 변경이 로컬에만 있다.** 배포된 백엔드에 반영되지 않았다

---

## 7. 함께 읽을 것

| 문서 | 왜 |
|---|---|
| 루트 `CLAUDE.md` | 보안 규칙, 화면에 쓰지 않는 말, RouteId 규약 |
| `Majung-Frontend/CLAUDE.md` | 의존성 방향, NativeWind 제약, **검증이 두 갈래인 이유** |
| `spec-majung-2nd/copy-voice.md` | 어체 규칙. **화면에 나갈 말을 쓰기 전에 읽는다** |
| `spec-majung-2nd/handoff-chat-suggestions.md` | AI 추천 질문 인수인계 (다른 세션이 구현 중) |
| `.claude/plans/fuzzy-churning-lighthouse.md` | 화면 ↔ 파일 매칭표, 화면별 차이 메모 |

---

## 8. 시작하는 법

```bash
cd C:\Users\skwog\Documents\freedom_project\Majung-Frontend
npx expo start --web --port 8340     # 이미 떠 있으면 그대로 쓴다
```

**시안 반영은 화면 열아홉 개가 모두 끝났다** (2026-08-31). 이어서 할 일은 §6의 열린 항목이며, 그중 **배포**가 가장 급하다 — 백엔드의 지역 조회 수정과 `institutions.json`·`graph.json` 변경이 로컬에만 있어서, 지금 배포본을 열어 보면 고치기 전의 동작이 그대로 나온다.

시안을 받을 때는 이렇게 한다.

```
mcp__figma__get_design_context({ nodeId: "5:1849", fileKey: "WUhuKu9IUAk7TUXjVEfy6m", ... })
```

**출력이 크면 파일로 떨어진다.** 그때는 `get_screenshot`으로 모양을 보고, 하위 노드를 따로 받아 값을 얻는다.
