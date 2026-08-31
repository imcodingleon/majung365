# 인수인계 — 지역 선택 개편 (단계 전환 · 검색 · 동 단위)

**작성일** 2026-08-31
**넘기는 쪽** 시안 반영 세션
**받는 쪽** 이 작업을 맡을 프론트엔드 세션

---

## 1. 사용자가 요청한 것

> "지도에서 위치 선택할때 지금은 어디 선택하면 아래에 어디에 계세요 라고 뜨잔아 그러지말고 기존에 있던 탭이 다음걸로 바뀌도록 해줘 그러면 이전으로 버튼도 필요하겠지 그리고 검색기능에 바로 군포를 검색했는데 군포시가 있는걸로 아는데 안뜨네? 흠? 그리고 군포시도 넓어 서울도 얼마나 넓겠어 동까지는 만들어야 할거 같은데"

세 갈래다.

| | 요청 | 성격 |
|---|---|---|
| **A** | 시·도를 고르면 **그 자리의 목록이 다음 단계로 바뀐다**. 아래에 덧붙이지 않는다. "이전으로" 버튼이 필요하다 | 화면 구조 |
| **B** | 검색창에 "군포"를 쳤는데 안 나온다 | 결함 |
| **C** | **동까지** 고를 수 있어야 한다 (군포시도 서울도 넓다) | 기능 추가 |

---

## 2. 먼저 알아야 할 사실 — 데이터는 이미 있다

**이 작업의 크기를 결정하는 사실이므로 먼저 적는다.**

### 군포시는 데이터에 있다. 검색이 못 찾은 것이다

`src/features/institutions/data/regions.json`에 `경기 > 군포시`가 들어 있다. 안 뜬 이유는 지금 검색이 **시·도만 거르기** 때문이다.

```ts
// src/features/institutions/views/RegionPicker.tsx (현재)
const shownSido = keyword ? REGIONS.filter((r) => r.sido.includes(keyword)) : REGIONS;
const shownDistricts = keyword ? districts.filter((d) => d.includes(keyword)) : districts;
```

시·도를 고르기 전에는 `shownSido`만 화면에 있으므로, "군포"는 어느 시·도 이름과도 안 맞아 빈 화면이 된다. **설계대로 동작한 것이지 데이터가 없는 것이 아니다.**

### 동 데이터가 이미 앱 안에 있다

`src/shared/location/dongs.json` — **1.6MB, 행정동 3,495개.**

```json
{
  "scale": 10000,
  "source": "...",
  "areas": [
    { "s": "경기도", "g": "군포시", "d": "산본1동", "b": [1269370, 373312, 1269624, 373663], "r": [...] }
  ]
}
```

| 키 | 뜻 |
|---|---|
| `s` | 시·도 (**긴 이름** — "경기도", "강원도") |
| `g` | 시·군·구 ("군포시") |
| `d` | 행정동 ("산본1동") |
| `b` | 경계 상자 `[minLng, minLat, maxLng, maxLat]`을 `scale`(10000)로 곱한 정수 |
| `r` | 경계 좌표열 (좌표→동 판정에 쓴다) |

**군포시에 동이 11개 있다** (산본1동·산본2동·재궁동 등). 새로 만들 데이터가 없다.

### 이름 체계가 두 벌이다 — 여기가 함정이다

| 파일 | 시·도 표기 |
|---|---|
| `regions.json` | **짧은 이름** — "경기", "강원", "서울" |
| `dongs.json` | **긴 이름** — "경기도", "강원도", "서울특별시" |

둘을 그대로 대조하면 하나도 안 맞는다. `region.ts`의 `matchRegion`이 이미 `startsWith`로 이 문제를 다루고 있으니 그 방식을 따르거나, 짝을 지어 주는 함수를 도메인에 하나 두는 편이 낫다.

---

## 3. 왜 동까지 필요한가 — 이미 겪은 문제다

루트 `CLAUDE.md`의 2026-08-26 결정 F-1이 정확히 이 상황을 적어 두었다.

> **시군구까지만 아는 서버는 그 동네 기관들의 한가운데로 거리를 쟀는데, 시군구 안에서 그 한가운데가 엉뚱한 곳을 가리켰다.** 군포시는 기관이 산본신도시에 몰려 있어, 군포역에 사는 사람에게 산본 주민센터가 먼저 나왔다.

사용자가 "군포시도 넓어"라고 한 것이 이 이야기다. 좌표를 받기로 뒤집은 것도 이 문제 때문이었고, **위치를 직접 고르는 사람에게는 그 해법이 아직 없다.**

### 그래서 서버를 안 고치고도 풀 수 있다

`getCenters`는 이미 좌표를 받는다.

```ts
// src/shared/utils/api.ts
export async function getCenters(place?: { sido: string; district: string; lat?: number; lng?: number })
```

**동을 고르면 그 동의 중심 좌표를 `lat`·`lng`로 함께 보내면 된다.** 경계 상자에서 바로 낼 수 있다.

```ts
const [minLng, minLat, maxLng, maxLat] = area.b;
const lng = (minLng + maxLng) / 2 / scale;
const lat = (minLat + maxLat) / 2 / scale;
```

- **서버 계약을 바꾸지 않는다.** 새 파라미터가 필요 없다
- 지도 목록이 그 동을 기준으로 가까운 순서가 되고, 카드에 거리도 뜬다(지금은 지역을 직접 고르면 거리가 안 나온다)
- **보안**: 이 좌표는 사용자의 실제 위치가 아니라 **사용자가 스스로 고른 동의 대표 좌표**다. GPS 좌표를 보내는 것보다 덜 민감하며, F-1이 이미 좌표 전송을 승인했다

---

## 4. 지금 코드가 어떻게 되어 있나

### 화면

`src/features/institutions/views/RegionPicker.tsx` (2026-08-31 시안 반영 완료)

```
[배너] 지역 선택 + 설명 + 지도 그림      ← banner prop이 참일 때만
[검색창] 지역명을 검색해 보세요
"시/도 선택"
[4열 격자] 강원 경기 경남 …             ← 고르면 파란 테두리
"{시도} 어디에 계세요?"                  ← ★ 아래에 덧붙는다. 여기를 바꿔야 한다
[3열 격자] 강남구 강동구 …
[선택 완료]                              ← 시·도만 골라도 눌린다
```

상태는 셋이다.

```ts
const [sido, setSido] = useState<string | null>(null);
const [district, setDistrict] = useState<string | null>(null);
const [query, setQuery] = useState("");
```

### 쓰는 곳 둘

| 화면 | 자리 | 배너 |
|---|---|---|
| `features/centers/views/MapScreen.tsx` | 위치를 못 잡았거나 "지역 변경"을 눌렀을 때 | 켠다 |
| `features/institutions/views/NearbyScreen.tsx` | 다른 안내 아래에 끼워 넣는다 | 끈다 |

`MapScreen`은 `changing` 상태로 지역 선택을 다시 띄운다. 저장된 위치를 지우지 않는다.

### 도메인

`src/features/institutions/domain/region.ts`

```ts
export const REGIONS: readonly Region[];            // { sido, districts }
export function districtsOf(sido: string): readonly string[];
export type SelectedRegion = { sido: string; district: string | null };
export function matchRegion(parts): SelectedRegion | null;   // 좌표→지역 (자동 감지가 쓴다)
```

**`SelectedRegion`에 동이 없다.** 여기를 늘려야 한다.

### 이 값을 받는 쪽

```ts
// useRegionLookup.ts — picked를 LocatedPlace로 바꾼다
return { sido: picked.sido, district: picked.district ?? "", dong: "" };
```

`LocatedPlace`에 **`dong` 칸이 이미 있다.** 자동 감지 경로는 이미 동까지 채운다. 직접 고르는 경로만 비어 있다.

---

## 5. 해야 할 일

### A. 단계 전환 (요청 A)

지금은 한 화면에 두 격자가 쌓인다. **한 번에 한 단계만 보이게** 바꾼다.

```
1단계  시/도 선택        → 고르면 2단계로
2단계  {시도} 시/군/구    → [← 이전으로]  고르면 3단계로
3단계  {시군구} 읍/면/동  → [← 이전으로]  고르면 선택 완료 활성화
```

- **"이전으로"는 왼쪽 위**에 둔다. 저리터러시 전제에서 되돌아갈 길이 보이지 않으면 앱을 껐다 켠다
- 지금 어디까지 골랐는지 늘 보여야 한다. 예: `경기 > 군포시` 같은 자취를 제목 옆에 둔다
- **각 단계를 건너뛸 수 있어야 한다.** 센터가 없는 시·군·구가 있고, 동을 모르는 사람도 있다. "선택 완료"는 시·도만 골라도 눌리는 지금 동작을 유지한다
- `banner`가 꺼진 자리(`NearbyScreen`)에서도 단계 전환이 자연스러운지 확인한다

### B. 검색이 모든 단계를 훑도록 (요청 B)

"군포"를 치면 **어느 단계에 있든** 결과가 나와야 한다.

```
검색어 "군포"
  → 경기 > 군포시                     (시·군·구 일치)
검색어 "산본"
  → 경기 > 군포시 > 산본1동           (동 일치)
```

- 결과를 누르면 그 지역이 **한 번에 확정**된다. 단계를 되짚게 하지 않는다
- 결과에 **상위 지역을 함께 적는다.** "중앙동"은 여러 시·군·구에 있어서, 어느 중앙동인지 모르면 고를 수 없다
- 동까지 훑으면 후보가 3,495개다. **입력이 한 글자일 때는 시·도·시군구까지만 훑고**, 두 글자부터 동을 훑는 식으로 끊는 것을 권한다

### C. 동 단계 추가 (요청 C)

1. `domain/region.ts`에 동 조회를 더한다

```ts
/** 그 시·군·구의 행정동. dongs.json에서 뽑는다. */
export function dongsOf(sido: string, district: string): readonly string[];

/** 그 동의 대표 좌표. 지도가 거리를 재는 기준이 된다. */
export function dongCenter(sido: string, district: string, dong: string): { lat: number; lng: number } | null;
```

2. `SelectedRegion`에 `dong: string | null`을 더한다
3. `useRegionLookup`의 `pick`이 동과 좌표를 함께 담는다
4. `MapScreen`이 그 좌표를 `getCenters`에 넘긴다 (이미 `origin`을 쓰는 자리가 있다)

**시·도 이름을 맞추는 함수를 도메인에 하나 둔다.** `regions.json`의 "경기"와 `dongs.json`의 "경기도"를 짝지어야 하고, 그 규칙이 화면에 흩어지면 한쪽만 고치게 된다.

---

## 6. 걸림돌과 판단이 필요한 것

### 1.6MB를 화면이 읽어도 되는가

`dongs.json`은 이미 `src/shared/location/locate.ts`가 좌표→동 판정에 쓰고 있으므로 **번들에는 이미 들어 있다.** 새로 무거워지지는 않는다.

다만 **경계 좌표열(`r`)까지 메모리에 올릴 필요는 없다.** 화면이 필요한 것은 `s`·`g`·`d`와 `b`뿐이다. 목록을 만들 때 필요한 필드만 뽑아 쓰고, 한 번 만든 목록은 `useMemo`로 붙잡는다.

### 센터가 없는 동을 어떻게 다루나

`regions.json`의 시·군·구는 "센터가 있는 곳만" 담겨 있다(파일 주석). 반면 `dongs.json`은 **행정동 전체**다. 즉 고를 수는 있지만 결과가 비는 동이 생긴다.

- 지금 화면은 결과가 없으면 "조건에 맞는 센터가 없어요."를 낸다. 그대로 두어도 막다른 길은 아니다
- 다만 **동을 고르는 목적이 거리 정확도**이므로, 센터가 없어도 그 좌표로 가까운 순서를 매기면 이웃 동의 기관이 나온다. 오히려 이쪽이 낫다

### 자동 감지 경로를 건드리지 않는다

**사용자가 못 박은 것이다.**

> "처음에 위치감지해서 지도 자동으로 지역에 따라 뜨게하는 기능은 개발되있어 이화면은 해당 기능에 오류가 생기거나 위치정보에 동의 안할시에 출력되는 화면이야 화면은 구현하되 기능은 그대로"

`locate.ts`와 `useRegionLookup`의 위치 판정 부분은 손대지 않는다. `pick` 쪽(직접 고르는 경로)만 늘린다.

### 이름을 화면에 어떻게 적나

시·도는 짧은 이름("경기")이 화면 관례다. 동까지 고르면 `경기 군포시 산본1동`이 되어 길다. 지도의 지역 배지가 이 값을 쓰므로(`MapScreen`의 `ListHeading`) 어디까지 적을지 정해야 한다. **가장 좁은 단위만 적고 나머지는 줄이는 안**을 권한다.

---

## 7. 검증

`e2e/region.spec.ts`에 6개가 이미 있다. **단계 전환으로 바꾸면 그중 몇은 깨진다** — 지금은 "시·도를 고르면 아래에 시·군·구가 나온다"를 검증하기 때문이다. 고치면서 함께 손본다.

넣어야 할 검증.

- 시·도를 고르면 **시·도 격자가 사라지고** 시·군·구 격자가 그 자리에 온다
- "이전으로"를 누르면 앞 단계로 돌아가고, 앞서 고른 값이 풀린다
- "군포"를 검색하면 **시·도를 고르지 않은 상태에서도** 군포시가 나온다
- 검색 결과를 누르면 단계를 건너뛰고 바로 확정된다
- 동을 고르면 지도 목록에 **거리가 뜬다** (지금은 직접 고르면 거리가 없다)
- 시·도만 골라도, 시·군·구까지만 골라도 "선택 완료"가 눌린다

```bash
cd Majung-Frontend
npm run e2e -- e2e/region.spec.ts
npm test
npx tsc --noEmit
```

**e2e 함정 셋**(다른 인수인계 문서에도 적어 두었다)

1. 시계를 고정하면 React Native 애니메이션이 멈춘다 → `freezeClock: false`
2. 개발 서버가 오래 돌면 HTML 응답이 28초까지 늘어진다 → 재시작하면 0.2초
3. 화면 치수는 **눈으로 판단하지 말고** `boundingBox()`로 잰다

---

## 8. 함께 읽을 것

| 문서 | 왜 |
|---|---|
| 루트 `CLAUDE.md` | **결정 F-1** — 좌표를 받기로 뒤집은 이유가 곧 이 작업의 이유다 |
| `Majung-Frontend/CLAUDE.md` | 의존성 방향, 위치 처리 규칙 |
| `spec-majung-2nd/copy-voice.md` | 새로 쓸 문구("이전으로" 등)의 어체 |
| `spec-majung-2nd/handoff-figma-redesign.md` | 시안 반영 전체 진척과 남은 화면 |
| `majung365_리뉴얼_개발플로_기획안_v2.md` §5.4 | 기관 안내의 제품 결정 |
