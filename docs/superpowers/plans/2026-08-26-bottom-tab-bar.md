# 하단 메뉴바 다섯 칸 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 아래쪽에 홈·알림·상담·지도·내 정보 다섯 칸 메뉴바를 두고, 담당자가 보낸 채팅이 사용자에게 도달하지 않던 결함을 함께 고친다.

**Architecture:** expo-router의 `(tabs)` 그룹을 되살려 기존 주소를 그대로 유지한다. 지워진 화면들은 커밋 `a6fe9b8` 직전에서 꺼내 되살리고, 아이콘만 기존 SVG 체계로 다시 그린다. 알림은 서버에 저장하지 않고 이미 있는 방문 요청 데이터를 조합해서 만든다.

**Tech Stack:** Expo · expo-router · React Native · NativeWind · react-native-svg · socket.io-client · TypeScript

**Spec:** `docs/superpowers/specs/2026-08-26-bottom-tab-bar-design.md`
**결정 기록:** `_bmad-output/specs/spec-majung-2nd/decision-log-2026-08-26.md`
**소켓 계약 정본:** `Majung-Backend/docs/socket-contract.md`

## Global Constraints

- **작업 브랜치는 `origin/main`에서 딴다.** `feat/frontend-renewal`은 이미 병합되었으므로 거기서 갈라내면 뒤처진 상태로 출발한다
- **서비스명 표기는 `마중365`다**
- **화면에 "죄목"·"설문"·"영역"을 쓰지 않는다.** 각각 "어떤 일로 계셨는지"·"상황 알아보기"·"분야"다
- **분류 단위는 지원 항목(`RouteId`)이며 `R1~R4`·`R6~R15`다. R5는 결번이다**
- **소켓 필드는 camelCase(`senderRole`·`clientMsgId`), REST 필드는 snake_case(`route_id`·`client_msg_id`)다.** 표기가 다른 것은 의도된 것이며 계약 문서에 근거가 있다. 이름이 어긋나면 오류가 아니라 `undefined`가 되어 말풍선이 한쪽에 전부 붙는다
- **아이콘은 24×24 격자에 2px 획, 둥근 마감이다.** `src/shared/components/Icon.tsx`의 규칙을 따른다
- **채팅에서 이미지를 주고받지 않는다.** 텍스트만이다
- **좌표를 우리 서버로 보내지 않는다.** `src/shared/location/`의 기기 내 계산 경로는 손대지 않는다
- **화면 문구는 `humanize-korean` 스킬로 점검한 뒤 확정한다**
- 각 작업 끝에 `npx tsc --noEmit`과 `npm run lint`가 통과해야 한다
- **다른 Claude 세션에 작업을 맡기지 않는다.** 백엔드 변경도 직접 한다

## 실행 순서

문서에서는 Task 10이 맨 앞에 있으나 **실행은 1 → 9 → 10 순서다.** 서버를 뒤로 미루는 이유는 Task 1~6이 서버 없이 전부 되기 때문이며, 눈에 보이는 화면을 먼저 완성하고 서버는 한 번만 배포하려는 것이다.

| 순서 | Task | 서버 필요 |
|---|---|---|
| 1 | Task 1 하단 바 뼈대 | 아니오 |
| 2 | Task 2 홈 중복 버튼 제거 | 아니오 |
| 3 | Task 3 지도 탭 | 아니오 |
| 4 | Task 4 담당자 채팅 연결 | 아니오 |
| 5 | Task 5 상담 탭 | 아니오 |
| 6 | Task 6 알림 탭 | 아니오 |
| 7 | Task 8 문서 갱신 | — |
| 8 | Task 9 배포와 확인 | — |
| 9 | **Task 10 서버 세 건** | 직접 한다 |
| 10 | Task 7 배지 잇기 | Task 10 이후 |

---

## Task 10: 서버 세 건 (프론트를 마친 뒤에 한다)

**순서상 마지막이다.** Task 1~6은 서버 없이 전부 되고, Task 7만 이 결과를 기다린다. 눈에 보이는 화면을 먼저 완성한 뒤 서버를 한 번에 고치고 한 번만 배포한다.

**다른 세션에 맡기지 않고 직접 한다.** 백엔드 코드가 같은 저장소 `Majung-Backend/`에 있다.

**Files:**
- Modify: `Majung-Backend/app/domains/visit/adapter/inbound/api/router.py`
- Modify: `Majung-Backend/app/domains/visit/adapter/inbound/socket/server.py`
- Modify: `Majung-Backend/app/domains/centers/data/district_offices.json` 외 2개
- Create: `tools/fill_coordinates.py`

**Interfaces:**
- Produces:
  - `GET /api/visits` 응답에 `unread: number`가 생긴다
  - `GET /api/centers?sido=…&district=…` 응답에 주민센터·공단 지부·정신건강복지센터가 좌표와 함께 포함된다

- [ ] **Step 1: 안 읽은 메시지 수를 방문 응답에 넣는다**

`GET /api/visits`의 `VisitOut`에 `unread: int` 한 필드를 더한다. 개수를 세는 `unread_for()`가 `visit/application/chat_usecase.py`에 이미 있다. 지금 응답에 `chat_available`은 있으나 안 읽은 수가 없어서, 화면이 배지 숫자를 알 수 없다.

`_to_out()`에서 유스케이스의 `unread_for(r, SenderRole.USER)`를 불러 채운다. **담당자 쪽 응답(`_staff_out`)에는 `SenderRole.STAFF`로 센 값을 넣는다** — 역할을 바꿔 넣으면 자기가 보낸 것을 안 읽은 것으로 세게 된다.

- [ ] **Step 2: 담당자 채팅 열람에 감사 로그를 남긴다**

코드 리뷰 M4다. 소켓 `join`이 `room_for_staff`로 남의 대화 전체를 읽으면서 기록을 남기지 않는다. 방이 기관 단위로 열리므로 같은 기관 담당자가 임의 `visitId`로 들어가 읽을 수 있고 흔적이 없다. `0003_staff_account.sql`이 `action` 값에 `chat`을 이미 적어 두었다. **상담 탭을 만들면 채팅이 앱의 주요 통로가 되므로 이 자리가 더 중요해진다.**

`socket/server.py`의 `join` 처리에서, 담당자로 판정된 접속이 방에 들어갈 때 `_log`와 같은 경로로 `action="chat"`을 남긴다. 출소자 본인의 입장은 남기지 않는다 — 자기 방이므로 감사 대상이 아니다.

- [ ] **Step 3: 기관 데이터에 좌표를 채운다**

지도에 마커를 찍으려면 위도·경도가 필요한데, 지금 좌표가 있는 것은 `centers.json` 8건뿐이다.

| 파일 | 건수 | 좌표 |
|---|---|---|
| `centers.json` | 8 | 있음 |
| `district_offices.json` | 3,555 | 없음 |
| `koreha_branches.json` | 38 | 없음 |
| `mental_health_centers.json` | 246 | 없음 |

세 파일 3,839건에 `lat`·`lng`를 채운다. 주소는 이미 있으므로 한 번 변환해 파일에 넣어 두면 끝난다. 생성 스크립트가 `tools/build-institutions.py`와 `tools/build_district_offices.py`에 있으므로, 같은 자리에 `tools/fill_coordinates.py`를 만든다.

**기관 주소는 개인정보가 아니다.** 변환에 외부 API를 써도 사용자 위치가 나가지 않는다. 이것은 §5.4가 금지한 "사용자 좌표의 역지오코딩"과 다른 일이다.

스크립트가 지켜야 할 것 셋이다.

- **이미 좌표가 있는 항목은 건너뛴다.** 다시 돌려도 요금이 두 번 나가지 않는다
- **변환에 실패한 항목은 좌표 없이 남기고 목록으로 보고한다.** 실패를 조용히 넘기면 어느 기관이 지도에서 빠졌는지 모른다
- **키는 인자나 환경변수로 받는다.** 스크립트에 적지 않는다

- [ ] **Step 4: `/api/centers`가 지역으로 좁혀 주게 한다**

`GET /api/centers`가 `sido`·`district`를 받아 그 지역 기관을 좌표와 함께 돌려주게 확장한다. **3,555건을 한 번에 보내면 안 된다.** 프론트가 창구 하나만 부르면 되도록 하려는 것이다.

지금 `category`만 받으므로 파라미터 둘을 더하고, `district_offices.json`·`koreha_branches.json`·`mental_health_centers.json`을 `Center` 모양으로 바꿔 함께 낸다. `category` 값은 화면의 칩과 맞춘다 — `법무보호공단` · `주민센터` · `고용센터`.

- [ ] **Step 5: 검사와 배포**

```bash
cd Majung-Backend
uv run ruff check .
uv run mypy .
uv run pytest
```

셋 다 통과해야 한다. 그 뒤 EC2에 배포하고 **파일 해시를 대조한다** — 배포 명령이 성공했다고 서버가 최신인 것은 아니다.

- [ ] **Step 6: 프론트의 남은 자리를 잇는다**

Task 7(배지)과 Task 3의 `useNearbyCenters`(지역으로 좁혀 부르기)를 이어서 마친다.

---

## Task 1: 작업 브랜치와 하단 메뉴바 뼈대

**Files:**
- Create: `Majung-Frontend/src/app/(tabs)/_layout.tsx`
- Create: `Majung-Frontend/src/shared/components/TabBadge.tsx`
- Modify: `Majung-Frontend/src/shared/components/Icon.tsx`
- Move: `Majung-Frontend/src/app/today.tsx` → `src/app/(tabs)/today.tsx`
- Move: `Majung-Frontend/src/app/my-info.tsx` → `src/app/(tabs)/my-info.tsx`
- Create: `Majung-Frontend/src/app/(tabs)/alerts.tsx` (자리만 잡는 화면)
- Create: `Majung-Frontend/src/app/(tabs)/chats.tsx` (자리만 잡는 화면)
- Create: `Majung-Frontend/src/app/(tabs)/map.tsx` (자리만 잡는 화면)

**Interfaces:**
- Consumes: `Icon` (`src/shared/components/Icon.tsx`), `COLORS` (`src/shared/theme/colors.ts`)
- Produces:
  - `Icon`에 `IconName` 두 개가 늘어난다 — `"home"`, `"person"`
  - `TabBadge({ count }: { count: number })` — `count`가 0이면 `null`을 돌려준다
  - 주소 다섯 개가 산다 — `/today`, `/alerts`, `/chats`, `/map`, `/my-info`

- [ ] **Step 1: 작업 브랜치를 만든다**

```bash
cd /c/Users/skwog/Documents/freedom_project
git fetch origin
git checkout -b feat/bottom-tab-bar origin/main
git log -1 --oneline
```

기대: `76fcc10` 또는 그보다 늦은 커밋이 나온다.

- [ ] **Step 2: 앞서 쓴 문서 두 개를 이 브랜치로 가져온다**

두 문서는 `feat/frontend-renewal`에서 작성되어 아직 커밋되지 않았다. 작업 트리에 그대로 남아 있으므로 확인만 한다.

```bash
ls docs/superpowers/specs/2026-08-26-bottom-tab-bar-design.md
ls _bmad-output/specs/spec-majung-2nd/decision-log-2026-08-26.md
git add docs/superpowers _bmad-output/specs/spec-majung-2nd/decision-log-2026-08-26.md
git commit -m "docs(nav): 하단 메뉴바 설계와 계약을 뒤집는 결정을 기록한다"
```

- [ ] **Step 3: 아이콘 두 개를 더한다**

`Icon.tsx`에서 세 곳을 고친다. 먼저 `IconName`에 두 줄을 넣는다.

```ts
export type IconName =
  | "check"
  | "close"
  | "phone"
  | "bot"
  | "send"
  | "down"
  | "back"
  | "key"
  | "chat"
  | "bell"
  | "undo"
  | "checkCircle"
  | "pin"
  | "home"
  | "person";
```

다음으로 `SHAPES` 바로 위에 도형 두 개를 더한다.

```tsx
/** 집. 지붕과 몸통, 문 하나. 문이 없으면 도형으로만 보인다. */
function Home({ color }: { color: string }) {
  return (
    <>
      <Path d="M3.5 10.5 12 3.5l8.5 7" stroke={color} {...line} />
      <Path d="M5.5 9.8V20h13V9.8" stroke={color} {...line} />
      <Path d="M9.8 20v-5.2h4.4V20" stroke={color} {...line} />
    </>
  );
}

/** 사람. 머리와 어깨. 얼굴을 그리지 않는다 — 작은 크기에서 뭉친다. */
function Person({ color }: { color: string }) {
  return (
    <>
      <Circle cx={12} cy={8} r={3.6} stroke={color} fill="none" strokeWidth={STROKE} />
      <Path d="M4.8 20c0-3.6 3.2-5.8 7.2-5.8s7.2 2.2 7.2 5.8" stroke={color} {...line} />
    </>
  );
}
```

마지막으로 `SHAPES`에 두 줄을 더한다.

```ts
  pin: Pin,
  home: Home,
  person: Person,
};
```

- [ ] **Step 4: 숫자 배지 컴포넌트를 만든다**

`src/shared/components/TabBadge.tsx`를 새로 만든다.

```tsx
// 안 읽은 건수 배지. 아이콘 오른쪽 위에 붙는다.
//
// **0이면 그리지 않는다.** 0을 띄우면 읽을 것이 있다는 뜻으로 보인다.
import { Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";

export function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  // 세 자리가 되면 칸을 넘는다. 두 자리에서 끊는다.
  const label = count > 99 ? "99+" : String(count);
  return (
    <View
      style={{
        position: "absolute",
        top: -4,
        right: -10,
        minWidth: 18,
        height: 18,
        paddingHorizontal: 5,
        borderRadius: 9,
        backgroundColor: COLORS.alert,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: COLORS.surface, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}
```

- [ ] **Step 5: 화면 파일을 `(tabs)` 아래로 옮긴다**

```bash
cd Majung-Frontend
mkdir -p "src/app/(tabs)"
git mv src/app/today.tsx "src/app/(tabs)/today.tsx"
git mv src/app/my-info.tsx "src/app/(tabs)/my-info.tsx"
```

주소는 바뀌지 않는다. 괄호로 묶은 폴더는 주소에 나타나지 않기 때문이다.

- [ ] **Step 6: 나머지 세 칸의 자리를 잡는다**

세 파일을 같은 모양으로 만든다. `src/app/(tabs)/alerts.tsx`:

```tsx
import { Text, View } from "react-native";

export default function AlertsRoute() {
  return (
    <View className="flex-1 items-center justify-center bg-page">
      <Text className="text-body text-ink-sub">알림</Text>
    </View>
  );
}
```

`src/app/(tabs)/chats.tsx`와 `src/app/(tabs)/map.tsx`도 같은 모양으로 만들되, 함수 이름을 `ChatsRoute`·`MapRoute`로, 문구를 "상담"·"지도"로 바꾼다.

- [ ] **Step 7: 하단 바를 만든다**

`src/app/(tabs)/_layout.tsx`를 새로 만든다. 예선 파일에서 가져오는 것은 가운데 원형 버튼의 치수와 색이고, 아이콘과 화면 이름은 새로 쓴다.

```tsx
// 하단 메뉴바 다섯 칸.
//
// **본선에서 되살린 것이다.** 기획서 §5.1이 5탭을 폐기했으나 화면이 여섯 개로 늘어
// 이동 수단이 다시 필요해졌다. 근거는 decision-log-2026-08-26.md B-1에 있다.
//
// 아코디언은 폐기하지 않았다. 홈 칸 안에 그대로 들어간다.
import { type GestureResponderEvent, Pressable, Text, View } from "react-native";
import { Tabs } from "expo-router";

import { Icon, type IconName } from "@/shared/components/Icon";
import { TabBadge } from "@/shared/components/TabBadge";
import { COLORS } from "@/shared/theme/colors";

function TabIcon({ name, color, badge }: { name: IconName; color: string; badge?: number }) {
  return (
    <View>
      <Icon name={name} size={24} color={color} />
      {badge === undefined ? null : <TabBadge count={badge} />}
    </View>
  );
}

// 상담은 바 위로 솟은 파란 원이다. 슬롯을 벗어나야 하므로 절대 위치로 올린다.
function ChatFabButton({ onPress }: { onPress?: (e: GestureResponderEvent) => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="상담"
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 2 }}
    >
      <View
        style={{
          position: "absolute",
          top: -34,
          width: 66,
          height: 66,
          borderRadius: 33,
          backgroundColor: COLORS.brand,
          borderWidth: 5,
          borderColor: "#fafafa",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000000",
          shadowOpacity: 0.18,
          shadowRadius: 5,
          shadowOffset: { width: 0, height: 2 },
          elevation: 8,
        }}
      >
        <Icon name="chat" size={29} color={COLORS.surface} />
      </View>
      <Text style={{ fontSize: 11, color: COLORS.inkMuted, fontWeight: "600" }}>상담</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.brand,
        tabBarInactiveTintColor: COLORS.inkMuted,
        tabBarStyle: { height: 74, paddingBottom: 12, paddingTop: 8, overflow: "visible" },
        tabBarLabelStyle: { fontSize: 11, marginTop: 2, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: "홈",
          tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "알림",
          tabBarIcon: ({ color }) => <TabIcon name="bell" color={color} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: "상담",
          tabBarButton: (props) => <ChatFabButton onPress={props.onPress} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "지도",
          tabBarIcon: ({ color }) => <TabIcon name="pin" color={color} />,
        }}
      />
      <Tabs.Screen
        name="my-info"
        options={{
          title: "내 정보",
          tabBarIcon: ({ color }) => <TabIcon name="person" color={color} />,
        }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 8: 타입과 린트를 확인한다**

```bash
cd Majung-Frontend
npx tsc --noEmit
npm run lint
```

기대: 둘 다 오류 없이 끝난다. 오류가 나면 그 오류를 고치고 다시 돌린다.

- [ ] **Step 9: 화면을 띄워 눈으로 확인한다**

```bash
cd Majung-Frontend
npm run web
```

확인할 것 넷이다.

1. 다섯 칸이 모두 보이고 눌린다
2. 가운데 상담이 바 위로 솟은 파란 원이다
3. 홈에서 오늘의 할 일 아코디언이 그대로 동작한다
4. 주소창이 `/today`·`/alerts`·`/chats`·`/map`·`/my-info`로 바뀐다

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "feat(nav): 하단 메뉴바 다섯 칸을 되살린다 (§5.1 결정 뒤집음)"
```

---

## Task 2: 홈 화면의 중복 이동 버튼을 지운다

**Files:**
- Modify: `Majung-Frontend/src/app/(tabs)/today.tsx`
- Modify: `Majung-Frontend/src/features/tasks/views/TodayScreen.tsx`

**Interfaces:**
- Consumes: Task 1이 만든 `/map`·`/my-info` 주소
- Produces: `TodayScreen`에서 `onOpenNearby`·`onOpenMyInfo` 두 prop이 사라진다

- [ ] **Step 1: 두 버튼이 어디서 어디까지 걸쳐 있는지 센다**

```bash
cd Majung-Frontend
grep -rn "onOpenNearby\|onOpenMyInfo" src/
```

`today.tsx`에서 넘기는 자리와 `TodayScreen.tsx`에서 받아 그리는 자리가 나온다. **양쪽을 다 지워야 한다.** 한쪽만 지우면 타입 오류가 나거나 눌리지 않는 버튼이 남는다.

- [ ] **Step 2: `today.tsx`에서 두 줄을 지운다**

`src/app/(tabs)/today.tsx`에서 아래 두 줄을 지운다.

```tsx
        onOpenNearby={() => router.push("/nearby")}
        onOpenMyInfo={() => router.push("/my-info")}
```

`router`를 다른 곳에서 쓰지 않게 되면 `import`도 함께 정리한다.

- [ ] **Step 3: `TodayScreen.tsx`에서 받는 자리와 그리는 자리를 지운다**

Step 1의 검색 결과에 나온 줄을 따라 `Props` 타입에서 두 항목을 지우고, 두 버튼을 그리는 JSX도 지운다.

- [ ] **Step 4: 타입과 린트를 확인한다**

```bash
npx tsc --noEmit
npm run lint
```

**린트는 기존 결함 24건(오류 13·경고 11)을 안고 시작한다.** 전부 이번 작업 전부터 있던 것이며 `(tabs)/`·`TabBadge.tsx`·`Icon.tsx`에는 하나도 없다. 기준은 **"내가 만든 파일에 오류가 없고 전체 건수가 늘지 않는다"**이다. 다만 이번 작업에서 만지는 파일(`useVisitChat.ts` 2건 · `ChatPopup.tsx` 2건 · `AdminApp.tsx` 1건)의 오류는 그 작업을 할 때 함께 고친다.

기대: 오류가 없다. 지우다 남은 자리가 있으면 여기서 잡힌다.

- [ ] **Step 5: 화면으로 확인한다**

홈 화면에 "우리 동네 기관 찾기"와 "내 정보" 버튼이 더 이상 없고, 하단 바로 같은 곳에 갈 수 있다.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "refactor(today): 화면 안 이동 버튼을 지운다 — 하단 바가 그 자리다"
```

---

## Task 3: 지도 탭

**Files:**
- Restore: `Majung-Frontend/src/features/centers/views/MapScreen.tsx`
- Restore: `Majung-Frontend/src/features/centers/views/CenterMap.tsx`
- Restore: `Majung-Frontend/src/features/centers/views/CenterMap.web.tsx`
- Restore: `Majung-Frontend/src/features/centers/views/MapFallbackPanel.tsx`
- Restore: `Majung-Frontend/src/features/centers/index.ts`
- Create: `Majung-Frontend/src/features/centers/hooks/useNearbyCenters.ts`
- Modify: `Majung-Frontend/src/app/(tabs)/map.tsx`
- Delete: 되살린 파일 중 `hooks/useCenters.ts`와 `domain/demoCenters.ts`는 되살리지 않는다

**Interfaces:**
- Consumes: `useRegionLookup` (`src/shared/location`), `getInstitutions`·`getDistrictOffices` (`src/shared/utils/api.ts`), `RegionPicker` (`src/features/institutions/views/RegionPicker.tsx`)
- Produces:
  - `useNearbyCenters(): { centers: Center[]; loading: boolean; error: string | null; place: LocatedPlace | null }`
  - `MapScreen` — 검색창·카테고리·지도·목록을 그리는 화면

- [ ] **Step 1: 지워진 파일을 꺼낸다**

```bash
cd /c/Users/skwog/Documents/freedom_project
for f in views/MapScreen.tsx views/CenterMap.tsx views/CenterMap.web.tsx views/MapFallbackPanel.tsx index.ts; do
  git show "a6fe9b8^:Majung-Frontend/src/features/centers/$f" > "Majung-Frontend/src/features/centers/$f"
done
```

먼저 폴더가 있어야 한다.

```bash
mkdir -p Majung-Frontend/src/features/centers/views Majung-Frontend/src/features/centers/hooks
```

**`useCenters.ts`와 `demoCenters.ts`는 꺼내지 않는다.** 시연용 고정 데이터라 본선에서 쓰지 않는다.

- [ ] **Step 2: 본선 데이터를 가져오는 훅을 만든다**

`src/features/centers/hooks/useNearbyCenters.ts`를 새로 만든다. `src/app/nearby.tsx`가 이미 같은 일을 하고 있으므로 그 방식을 따른다.

**`/api/centers` 하나만 부른다.** 이 창구의 `Center`에만 `lat`·`lng`가 있고, `category` 값이 도안의 칩(법무보호공단·주민센터·고용센터)과 그대로 맞는다. `getInstitutions`와 `getDistrictOffices`는 좌표가 없어 지도에 찍을 수 없으므로 쓰지 않는다.

```ts
// 지도 탭이 쓸 기관 목록.
//
// **`/api/centers`만 부른다.** 좌표(`lat`·`lng`)가 있는 창구는 여기뿐이다.
// `/api/institutions`와 `/api/district-offices`는 주소만 있어 지도에 점을 찍을 수 없다.
//
// Task 10의 Step 3이 반영되면 이 창구가 주민센터와 공단 지부까지 좌표와 함께 돌려준다.
// 그전까지는 법무보호공단 8곳만 뜬다.
import { useEffect, useState } from "react";

import { useRegionLookup } from "@/shared/location";
import { getSession } from "@/shared/utils/session";
import { getCenters } from "@/shared/utils/api";
import type { Center } from "@/shared/types";

export function useNearbyCenters() {
  const lookup = useRegionLookup();
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 가입할 때 알아낸 곳을 먼저 쓴다. 이미 아는 것을 다시 묻지 않는다.
  // 화면 안에서 지역을 직접 골랐으면 그쪽이 이긴다 — 사용자가 방금 한 선택이다.
  const place = lookup.place ?? getSession()?.place ?? null;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        // 갈래를 고르지 않고 전부 받는다. 거르는 일은 화면의 칩이 한다.
        const all = await getCenters();
        if (alive) setCenters(all);
      } catch {
        if (alive) setError("기관을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { centers, loading, error, place };
}
```

**Task 10의 Step 3이 반영되면 이 훅을 한 번 더 고친다.** `getCenters()`가 `sido`·`district`를 받게 되므로 `getCenters(place.sido, place.district)`로 바꾸고, `place`가 없으면 부르지 않도록 한다. 3,555건을 한 번에 받으면 안 되기 때문이다.

- [ ] **Step 3: `MapScreen`이 새 훅을 쓰게 고친다**

되살린 `MapScreen.tsx`에서 `useCenters`를 부르는 자리를 `useNearbyCenters`로 바꾼다. 그리고 PNG 아이콘 다섯 개를 SVG로 바꾼다.

```tsx
// 지운다
const MAP_ICONS = {
  search: require("../../../../assets/images/map/search_c.png"),
  ...
};
```

`search`는 `Icon` 세트에 없으므로 `Icon.tsx`에 돋보기를 더한다. `phone`은 이미 있다. `directions`는 길찾기이므로 `pin`으로 대신한다. 즐겨찾기 별은 `star` 하나를 더해 채움 여부로 켜고 끈다.

```tsx
/** 돋보기. 원과 손잡이. */
function Search({ color }: { color: string }) {
  return (
    <>
      <Circle cx={11} cy={11} r={6.5} stroke={color} fill="none" strokeWidth={STROKE} />
      <Path d="M15.8 15.8 20.5 20.5" stroke={color} {...line} />
    </>
  );
}

/** 별. 즐겨찾기. 채우면 켜진 것이다. */
function Star({ color, filled }: { color: string; filled?: boolean }) {
  return (
    <Path
      d="M12 3.8l2.6 5.3 5.8.85-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.85z"
      stroke={color}
      fill={filled ? color : "none"}
      {...line}
    />
  );
}
```

`Star`는 `filled`를 받아야 하므로 `SHAPES`의 다른 도형과 모양이 다르다. 별만 `Icon`을 거치지 않고 `MapScreen`에서 직접 그리거나, `Icon`에 `filled?: boolean`을 더한다. **후자를 택한다** — 앞으로도 채움이 필요한 아이콘이 나온다.

- [ ] **Step 4: 위치를 못 받았을 때 지역을 고르게 한다**

`MapScreen`에서 `place`가 없으면 `RegionPicker`를 그린다.

`useRegionLookup()`은 `{ state, place, locate, pick, reset }`을 돌려주고, `RegionPicker`는 `onPick: (region: SelectedRegion) => void` 하나를 받는다.

```tsx
import { RegionPicker } from "@/features/institutions/views/RegionPicker";

// place가 없으면 지도 대신 지역 고르기를 낸다.
if (!place) {
  return <RegionPicker onPick={lookup.pick} />;
}
```

`useNearbyCenters`가 `lookup`을 밖으로 내주지 않으므로, 반환값에 `pick`을 더한다.

```ts
  return { centers, loading, error, place, pick: lookup.pick };
```

- [ ] **Step 5: 지도 탭에 연결한다**

`src/app/(tabs)/map.tsx`를 고친다.

```tsx
import { MapScreen } from "@/features/centers";

export default function MapRoute() {
  return <MapScreen />;
}
```

- [ ] **Step 6: 구글 키가 들어오는지 확인한다**

```bash
cd Majung-Frontend
grep EXPO_PUBLIC_GOOGLE_MAPS_KEY .env
```

키가 있어야 한다. 배포 빌드에도 넘어가야 하므로 저장소 최상위 `vercel.json`의 `buildCommand`에 키를 더한다.

```json
"buildCommand": "cd Majung-Frontend && INCLUDE_ADMIN=1 EXPO_PUBLIC_API_URL=https://3-34-251-223.sslip.io EXPO_PUBLIC_GOOGLE_MAPS_KEY=$EXPO_PUBLIC_GOOGLE_MAPS_KEY npx expo export -p web"
```

**키 값을 `vercel.json`에 직접 쓰지 않는다.** Vercel 프로젝트 환경변수에 등록하고 위처럼 참조한다.

- [ ] **Step 7: 타입과 린트를 확인한다**

```bash
npx tsc --noEmit
npm run lint
```

**린트는 기존 결함 24건(오류 13·경고 11)을 안고 시작한다.** 전부 이번 작업 전부터 있던 것이며 `(tabs)/`·`TabBadge.tsx`·`Icon.tsx`에는 하나도 없다. 기준은 **"내가 만든 파일에 오류가 없고 전체 건수가 늘지 않는다"**이다. 다만 이번 작업에서 만지는 파일(`useVisitChat.ts` 2건 · `ChatPopup.tsx` 2건 · `AdminApp.tsx` 1건)의 오류는 그 작업을 할 때 함께 고친다.

- [ ] **Step 8: 화면으로 확인한다**

```bash
npm run web
```

확인할 것 넷이다.

1. 위치를 허용하면 지도가 뜨고 주변 기관에 마커가 찍힌다
2. 위치를 거부하면 지역 고르기 화면이 나온다
3. 검색창에 이름을 넣으면 목록이 걸러진다
4. 카테고리 네 개가 눌린다

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "feat(map): 지도 탭을 되살리고 본선 기관 데이터로 잇는다 (§5.4 결정 뒤집음)"
```

---

## Task 4: 담당자가 보낸 메시지가 사용자에게 도달하게 한다

이 작업이 이번 계획의 핵심이다. **담당자 쪽만 만들고 사용자 쪽 짝을 만들지 않아 생긴 결함**을 고친다.

**Files:**
- Move: `Majung-Frontend/src/admin/hooks/useVisitChat.ts` → `src/features/visit/hooks/useVisitChat.ts`
- Move: `Majung-Frontend/src/admin/views/StaffChatScreen.tsx` → `src/features/visit/views/StaffChatScreen.tsx`
- Modify: `Majung-Frontend/src/admin/views/AdminApp.tsx` (import 경로)
- Create: `Majung-Frontend/src/features/visit/views/UserChatSheet.tsx`
- Modify: `Majung-Frontend/src/app/(tabs)/today.tsx:125`

**Interfaces:**
- Consumes: `useVisitChat(visitId: string | null, token: string | null): { messages: StaffMessage[]; blocked: string | null; connected: boolean; send: (text: string) => void; markRead: () => void }`
- Produces:
  - `StaffChatScreen`에 prop 하나가 늘어난다 — `myRole: "staff" | "client"`
  - `UserChatSheet({ request, onClose }: { request: VisitRequest; onClose: () => void })`

- [ ] **Step 1: 지금 무엇이 잘못되어 있는지 눈으로 확인한다**

```bash
cd Majung-Frontend
grep -n "onOpenStaffChat" src/app/\(tabs\)/today.tsx
grep -rn "useVisitChat" src/
```

기대: `onOpenStaffChat`이 `chat.open(taskId)`를 부르고 있고, `useVisitChat`은 `src/admin/`에서만 쓰인다. 이것이 담당자 메시지가 도달하지 않던 이유다.

- [ ] **Step 2: 훅과 화면을 공용 자리로 옮긴다**

```bash
git mv src/admin/hooks/useVisitChat.ts src/features/visit/hooks/useVisitChat.ts
git mv src/admin/views/StaffChatScreen.tsx src/features/visit/views/StaffChatScreen.tsx
```

`useVisitChat.ts`가 `../views/StaffChatScreen`에서 `StaffMessage`를 가져오고 있으므로 경로를 고친다.

```ts
import type { StaffMessage } from "../views/StaffChatScreen";
```

옮긴 뒤에도 같은 상대 경로가 맞는다. `AdminApp.tsx`의 import 두 줄은 새 경로로 고친다.

```ts
import { useVisitChat } from "@/features/visit/hooks/useVisitChat";
import { StaffChatScreen } from "@/features/visit/views/StaffChatScreen";
```

- [ ] **Step 3: 말풍선이 뒤집히지 않게 고친다**

지금 `StaffChatScreen.tsx`에 이렇게 되어 있다.

```tsx
const mine = m.from === "staff";
```

**"내 것"이 담당자로 고정되어 있다.** 사용자 쪽에서 이대로 쓰면 사용자가 보낸 말이 왼쪽에, 담당자 말이 오른쪽에 붙어 말풍선이 뒤집힌다.

`Props`에 한 항목을 더한다.

```tsx
type Props = {
  peerName: string;
  /** 이 화면을 보고 있는 쪽. 말풍선을 어느 쪽에 붙일지 정한다. */
  myRole: "staff" | "client";
  messages: readonly StaffMessage[];
  onSend: (text: string) => void;
  onBack: () => void;
  blocked?: string | null;
  connected?: boolean;
};
```

받는 자리와 쓰는 자리를 고친다.

```tsx
const mine = m.from === myRole;
```

`eyebrow`와 `closeHint`도 담당자 기준 문구이므로 prop으로 받는다.

```tsx
/** 제목 위 작은 글씨. 담당자는 "방문 조율", 사용자는 "담당자와 이야기하기"다. */
eyebrow?: string;
closeHint?: string;
```

`AdminApp.tsx`에서 `myRole="staff"`를 넘긴다.

- [ ] **Step 4: 사용자용 채팅을 여는 화면을 만든다**

`src/features/visit/views/UserChatSheet.tsx`를 새로 만든다.

```tsx
// 사용자가 담당자와 이야기하는 화면.
//
// **이 화면이 없어서 담당자가 보낸 말이 사용자에게 닿지 않았다.** 담당자 쪽만 만들고
// 사용자 쪽 짝을 만들지 않았고, "담당자와 이야기하기" 버튼이 AI 채팅을 열고 있었다.
//
// 연결은 `useVisitChat`이 맡는다. 담당자 쪽과 같은 훅, 같은 화면을 쓰고 토큰과
// `myRole`만 다르다.
import { useEffect, useState } from "react";

import { loadToken } from "@/shared/utils/tokenStore";

import type { VisitRequest } from "../domain/request";
import { useVisitChat } from "../hooks/useVisitChat";
import { StaffChatScreen } from "./StaffChatScreen";

export function UserChatSheet({
  request,
  onClose,
}: {
  request: VisitRequest;
  onClose: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    void loadToken().then(setToken);
  }, []);

  const chat = useVisitChat(request.id, token);

  // 방을 열면 읽음으로 표시한다. 상대는 자기 말이 닿았는지 알아야 기다릴 수 있다.
  useEffect(() => {
    if (chat.connected && !chat.blocked) chat.markRead();
  }, [chat.connected, chat.blocked, chat.markRead]);

  return (
    <StaffChatScreen
      peerName={request.confirmation?.staffName ?? "담당자"}
      myRole="client"
      eyebrow="담당자와 이야기하기"
      closeHint="할 일 목록으로 돌아가기"
      messages={chat.messages}
      onSend={chat.send}
      onBack={onClose}
      blocked={chat.blocked}
      connected={chat.connected}
    />
  );
}
```

`tokenStore`가 내보내는 것은 `saveToken(token: string): Promise<void>` · `loadToken(): Promise<string | null>` · `clearToken(): Promise<void>` 셋이다. 여기서 쓰는 것은 `loadToken` 하나다.

- [ ] **Step 5: 버튼을 이 화면에 잇는다**

`src/app/(tabs)/today.tsx`에서 `onOpenStaffChat`을 고친다. 지금은 이렇다.

```tsx
onOpenStaffChat={() => chat.open(taskId)}
```

이것을 담당자 채팅 화면을 여는 것으로 바꾼다. 어느 요청의 방인지 들고 있어야 하므로 상태를 하나 더한다.

```tsx
const [staffChatFor, setStaffChatFor] = useState<VisitRequest | null>(null);
```

```tsx
onOpenStaffChat={() => setStaffChatFor(request)}
```

그리고 화면 아래쪽, AI 채팅 팝업을 그리는 자리 옆에 더한다.

```tsx
{staffChatFor ? (
  <UserChatSheet request={staffChatFor} onClose={() => setStaffChatFor(null)} />
) : null}
```

`FramedModal`로 감쌀지 전체 화면으로 낼지는 AI 채팅 팝업이 하는 방식을 그대로 따른다.

- [ ] **Step 6: 타입과 린트를 확인한다**

```bash
npx tsc --noEmit
npm run lint
```

**린트는 기존 결함 24건(오류 13·경고 11)을 안고 시작한다.** 전부 이번 작업 전부터 있던 것이며 `(tabs)/`·`TabBadge.tsx`·`Icon.tsx`에는 하나도 없다. 기준은 **"내가 만든 파일에 오류가 없고 전체 건수가 늘지 않는다"**이다. 다만 이번 작업에서 만지는 파일(`useVisitChat.ts` 2건 · `ChatPopup.tsx` 2건 · `AdminApp.tsx` 1건)의 오류는 그 작업을 할 때 함께 고친다.

- [ ] **Step 7: 담당자와 사용자 양쪽으로 실제 대화를 주고받는다**

이 작업의 완료 조건이다. 브라우저 창을 둘 띄운다.

1. 한쪽에서 `/admin`으로 담당자 로그인을 한다
2. 다른 쪽에서 사용자로 방문 요청을 보낸다
3. 담당자 쪽에서 그 요청을 "확인함"으로 바꾼다
4. 담당자 쪽에서 채팅을 열고 메시지를 보낸다
5. **사용자 쪽에서 "담당자와 이야기하기"를 누른다**

확인할 것 넷이다.

- 담당자가 보낸 메시지가 사용자 화면에 보인다
- 사용자가 보낸 메시지가 담당자 화면에 보인다
- **양쪽 모두 자기가 보낸 말이 오른쪽에 붙는다** (Step 3에서 고친 것)
- 담당자가 확인하기 전에 열면 "담당자가 아직 확인하지 않았어요"가 나온다

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "fix(chat): 담당자가 보낸 말이 사용자에게 닿지 않던 것 — 버튼이 AI 채팅을 열고 있었다"
```

---

## Task 5: 상담 탭 — 대화 목록

**Files:**
- Create: `Majung-Frontend/src/features/chat/domain/conversation.ts`
- Create: `Majung-Frontend/src/features/chat/views/ChatListScreen.tsx`
- Modify: `Majung-Frontend/src/features/chat/hooks/useTaskThreads.ts` (반환값에 `threads` 추가)
- Modify: `Majung-Frontend/src/app/(tabs)/chats.tsx`
- Modify: `Majung-Frontend/src/app/(tabs)/today.tsx` (`openChat` 파라미터를 받아 그 대화를 연다)

**Interfaces:**
- Consumes: `useVisitRequests()` → `{ requests: VisitRequest[]; requestFor; cancel; ... }`, `useTaskThreads()` → `{ openTaskId; messages; busy; open; close; send; clear }`
- Produces:
  - `type Conversation = { kind: "staff" | "ai"; id: string; title: string; preview: string; at: string | null; unread: number }`
  - `toConversations(requests: VisitRequest[], threads: Record<string, ChatMessage[]>): Conversation[]`

- [ ] **Step 1: 목록을 만드는 계산을 먼저 쓴다 (테스트 있음)**

이 계산은 화면과 무관하므로 테스트를 둔다. Task 6에서 jest를 넣으므로, 여기서는 함수만 쓰고 테스트는 Task 6에서 함께 돌린다.

`src/features/chat/domain/conversation.ts`:

```ts
// 상담 탭에 쌓이는 대화 한 줄.
//
// **두 종류를 한 목록에 섞는다.** 담당자 대화는 방문 요청 단위이고, AI 대화는 할 일
// 단위다. 사용자에게는 둘 다 "이야기한 곳"이라 나누어 보일 이유가 없다.
import type { VisitRequest } from "@/features/visit/domain/request";
import type { ChatMessage } from "./chatMessage";

export type Conversation = {
  kind: "staff" | "ai";
  /** 담당자 대화면 방문 요청 id, AI 대화면 할 일 id. */
  id: string;
  title: string;
  /** 마지막 메시지 한 줄. 없으면 빈 문자열이다. */
  preview: string;
  /** 마지막 시각(ISO). 없으면 null이며 목록 맨 아래로 간다. */
  at: string | null;
  unread: number;
};

/** 최근에 말한 것이 위로 온다. 시각이 없는 것은 맨 아래다. */
function byRecent(a: Conversation, b: Conversation): number {
  if (a.at === null && b.at === null) return 0;
  if (a.at === null) return 1;
  if (b.at === null) return -1;
  return b.at.localeCompare(a.at);
}

export function toConversations(
  requests: readonly VisitRequest[],
  threads: Readonly<Record<string, readonly ChatMessage[]>>,
): Conversation[] {
  const staff: Conversation[] = requests
    // 담당자가 확인하기 전에는 방이 열리지 않는다(§7.3-4). 목록에도 내지 않는다.
    // 상태는 sent · acknowledged · confirmed · reschedule_proposed · completed · cancelled 여섯이다.
    .filter((r) => r.status !== "sent" && r.status !== "cancelled")
    .map((r) => ({
      kind: "staff" as const,
      id: r.id,
      title: r.confirmation?.staffName ?? "담당자",
      // **마지막 메시지를 여기서 보여주지 못한다.** 담당자 대화는 소켓으로 방에
      // 들어가야 내용이 오고, 목록을 그리자고 방마다 붙을 수는 없다. 서버가 나중에
      // 마지막 메시지를 요청 응답에 실어 주면 그때 채운다.
      preview: "",
      at: r.createdAt ?? null,
      unread: 0,
    }));

  const ai: Conversation[] = Object.entries(threads)
    .filter(([, messages]) => messages.length > 0)
    .map(([taskId, messages]) => ({
      kind: "ai" as const,
      id: taskId,
      title: "마중365와 나눈 이야기",
      preview: messages[messages.length - 1]?.text ?? "",
      at: null,
      unread: 0,
    }));

  return [...staff, ...ai].sort(byRecent);
}
```

`ChatMessage`의 실제 필드 이름은 `src/features/chat/domain/chatMessage.ts`를 열어 맞춘다. `unread`는 Task 7에서 서버 필드가 오면 채운다. 지금은 0이다.

- [ ] **Step 2: 목록 화면을 만든다**

`src/features/chat/views/ChatListScreen.tsx`를 만든다. 한 줄에 제목, 마지막 메시지, 안 읽은 건수 배지를 그린다.

```tsx
import { Pressable, ScrollView, Text, View } from "react-native";

import { Icon } from "@/shared/components/Icon";
import { TabBadge } from "@/shared/components/TabBadge";
import { COLORS } from "@/shared/theme/colors";

import type { Conversation } from "../domain/conversation";

export function ChatListScreen({
  conversations,
  onOpen,
}: {
  conversations: readonly Conversation[];
  onOpen: (c: Conversation) => void;
}) {
  if (conversations.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-page px-8">
        <Text className="text-center text-body text-ink-sub">
          아직 나눈 이야기가 없어요.{"\n"}할 일에서 담당자에게 알리거나 마중365에게 물어보세요.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-page">
      {conversations.map((c) => (
        <Pressable
          key={`${c.kind}:${c.id}`}
          onPress={() => onOpen(c)}
          className="flex-row items-center gap-4 border-b border-line px-5 py-4"
        >
          <Icon name={c.kind === "staff" ? "person" : "bot"} size={28} color={COLORS.brand} />
          <View className="min-w-0 flex-1">
            <Text className="text-body font-bold text-ink-strong">{c.title}</Text>
            {c.preview ? (
              <Text numberOfLines={1} className="mt-1 text-caption text-ink-sub">
                {c.preview}
              </Text>
            ) : null}
          </View>
          <View>
            <TabBadge count={c.unread} />
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}
```

- [ ] **Step 3: AI 대화 목록을 꺼낼 수 있게 훅을 연다**

`useTaskThreads`는 지금 열려 있는 대화의 `messages`만 내주고 전체 `threads`는 내주지 않는다. 목록 화면이 "어떤 할 일에서 대화했는지"를 알아야 하므로 반환값에 한 줄을 더한다.

`src/features/chat/hooks/useTaskThreads.ts`의 마지막 `return`을 고친다.

```ts
  return {
    /** 할 일별 대화 전체. 상담 탭의 목록이 쓴다. */
    threads,
    openTaskId,
    messages: openTaskId ? (threads[openTaskId] ?? []) : [],
    busy: busyId !== null && busyId === openTaskId,
    open,
    close,
    send,
    clear,
  };
```

- [ ] **Step 4: 상담 탭에 잇는다**

`src/app/(tabs)/chats.tsx`를 고친다. 목록을 만들고, 줄을 누르면 담당자 채팅이나 AI 채팅을 연다.

```tsx
import { useState } from "react";

import { toConversations, type Conversation } from "@/features/chat/domain/conversation";
import { ChatListScreen } from "@/features/chat/views/ChatListScreen";
import { useTaskThreads } from "@/features/chat/hooks/useTaskThreads";
import { useVisitRequests } from "@/features/visit/hooks/useVisitRequests";
import { UserChatSheet } from "@/features/visit/views/UserChatSheet";

export default function ChatsRoute() {
  const visit = useVisitRequests();
  const ai = useTaskThreads();
  const [openStaff, setOpenStaff] = useState<string | null>(null);

  const conversations = toConversations(visit.requests, ai.threads);

  const open = (c: Conversation) => {
    if (c.kind === "staff") setOpenStaff(c.id);
    else ai.open(c.id);
  };

  const request = openStaff ? visit.requests.find((r) => r.id === openStaff) : null;

  return (
    <>
      <ChatListScreen conversations={conversations} onOpen={open} />
      {request ? (
        <UserChatSheet request={request} onClose={() => setOpenStaff(null)} />
      ) : null}
    </>
  );
}
```

**AI 채팅 팝업은 `today.tsx`가 그리는 것을 그대로 쓴다.** `ChatPopup`은 할 일 카드의 문맥(근거 배지·연락처)을 함께 받는 화면이라, 상담 탭에서 같은 것을 다시 조립하면 두 곳에서 같은 조립을 하게 된다. 상담 탭에서 AI 대화를 누르면 홈으로 보내고 그 대화를 연다.

```tsx
  const open = (c: Conversation) => {
    if (c.kind === "staff") {
      setOpenStaff(c.id);
    } else {
      // 할 일 카드의 문맥이 있어야 제대로 그려진다. 홈으로 보내고 거기서 연다.
      router.push({ pathname: "/today", params: { openChat: c.id } });
    }
  };
```

`today.tsx`에서 `useLocalSearchParams()`로 `openChat`을 받아 그 값이 있으면 `chat.open(값)`을 부른다.

- [ ] **Step 5: 타입과 린트를 확인한다**

```bash
npx tsc --noEmit
npm run lint
```

**린트는 기존 결함 24건(오류 13·경고 11)을 안고 시작한다.** 전부 이번 작업 전부터 있던 것이며 `(tabs)/`·`TabBadge.tsx`·`Icon.tsx`에는 하나도 없다. 기준은 **"내가 만든 파일에 오류가 없고 전체 건수가 늘지 않는다"**이다. 다만 이번 작업에서 만지는 파일(`useVisitChat.ts` 2건 · `ChatPopup.tsx` 2건 · `AdminApp.tsx` 1건)의 오류는 그 작업을 할 때 함께 고친다.

- [ ] **Step 6: 화면으로 확인한다**

1. 방문 요청을 보내고 담당자가 확인하면 상담 탭에 그 줄이 생긴다
2. 줄을 누르면 담당자 채팅이 열리고 지난 대화가 함께 온다
3. AI와 대화한 할 일도 목록에 있고, 누르면 홈에서 그 대화가 열린다

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat(chats): 담당자 대화와 AI 대화를 한 목록에 모은다"
```

---

## Task 6: 알림 탭 — 계산과 화면

**Files:**
- Create: `Majung-Frontend/src/features/alerts/domain/alert.ts`
- Create: `Majung-Frontend/src/features/alerts/domain/alert.test.ts`
- Create: `Majung-Frontend/src/features/alerts/views/AlertListScreen.tsx`
- Create: `Majung-Frontend/src/features/alerts/hooks/useLastSeen.ts`
- Modify: `Majung-Frontend/src/app/(tabs)/alerts.tsx`
- Modify: `Majung-Frontend/package.json`
- Create: `Majung-Frontend/jest.config.js`

**Interfaces:**
- Consumes: `useVisitRequests()`, `VisitRequest`
- Produces:
  - `type Alert = { id: string; kind: "confirmed" | "proposed" | "cancelled" | "message"; title: string; body: string; at: string; visitId: string }`
  - `toAlerts(requests: readonly VisitRequest[]): Alert[]`
  - `countUnseen(alerts: readonly Alert[], lastSeen: string | null): number`
  - `useLastSeen(): { lastSeen: string | null; markSeen: () => void }`

- [ ] **Step 1: 테스트 도구를 넣는다**

계산만 테스트한다. 화면 테스트 도구는 넣지 않는다.

```bash
cd Majung-Frontend
npm install --save-dev jest ts-jest @types/jest
```

`jest.config.js`를 만든다.

```js
// 계산만 테스트한다. 화면은 타입 검사와 눈으로 확인한다.
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
};
```

`package.json`의 `scripts`에 한 줄을 더한다.

```json
"test": "jest"
```

- [ ] **Step 2: 실패하는 테스트를 먼저 쓴다**

`src/features/alerts/domain/alert.test.ts`:

```ts
import { countUnseen, toAlerts } from "./alert";
import type { VisitRequest } from "@/features/visit/domain/request";

function req(over: Partial<VisitRequest>): VisitRequest {
  return {
    id: "v1",
    taskId: "R1",
    status: "sent",
    firstChoice: "2026-08-27T14:00:00+09:00",
    readyDocs: [],
    createdAt: "2026-08-26T09:00:00+09:00",
    ...over,
  } as VisitRequest;
}

describe("toAlerts", () => {
  it("보내기만 한 요청은 알림이 되지 않는다", () => {
    expect(toAlerts([req({ status: "sent" })])).toEqual([]);
  });

  it("확정되면 알림이 하나 생긴다", () => {
    const alerts = toAlerts([
      req({
        status: "confirmed",
        confirmation: { whenLabel: "8월 27일 오후 2시", staffName: "김담당", place: "2층 상담실" },
      }),
    ]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("confirmed");
    expect(alerts[0].body).toContain("김담당");
    expect(alerts[0].body).toContain("2층 상담실");
  });

  it("최근 것이 위로 온다", () => {
    const alerts = toAlerts([
      req({ id: "a", status: "cancelled", createdAt: "2026-08-24T09:00:00+09:00" }),
      req({ id: "b", status: "cancelled", createdAt: "2026-08-26T09:00:00+09:00" }),
    ]);
    expect(alerts.map((a) => a.visitId)).toEqual(["b", "a"]);
  });
});

describe("countUnseen", () => {
  const alerts = [
    { id: "1", kind: "confirmed", title: "", body: "", at: "2026-08-26T10:00:00+09:00", visitId: "a" },
    { id: "2", kind: "cancelled", title: "", body: "", at: "2026-08-25T10:00:00+09:00", visitId: "b" },
  ] as const;

  it("한 번도 안 봤으면 전부 안 읽은 것이다", () => {
    expect(countUnseen(alerts, null)).toBe(2);
  });

  it("마지막으로 본 시각보다 늦은 것만 센다", () => {
    expect(countUnseen(alerts, "2026-08-25T12:00:00+09:00")).toBe(1);
  });

  it("전부 본 뒤에는 0이다", () => {
    expect(countUnseen(alerts, "2026-08-27T00:00:00+09:00")).toBe(0);
  });
});
```

- [ ] **Step 3: 테스트가 실패하는 것을 확인한다**

```bash
npm test
```

기대: `Cannot find module './alert'`로 실패한다.

- [ ] **Step 4: 계산을 구현한다**

`src/features/alerts/domain/alert.ts`:

```ts
// 알림 목록.
//
// **서버에 알림을 쌓지 않는다.** 이미 있는 방문 요청 데이터를 조합해서 만든다.
// 알림을 서버에 저장하면 "누가 언제 어느 기관과 연락했는가"가 한 줄씩 남고, 그것은
// 보관·파기 대상(§9.4)이 늘어나는 일이다. 근거는 decision-log-2026-08-26.md A-3에 있다.
import type { VisitRequest } from "@/features/visit/domain/request";

export type AlertKind = "confirmed" | "proposed" | "cancelled" | "message";

export type Alert = {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  /** ISO 시각. 정렬과 안 읽음 판정에 쓴다. */
  at: string;
  /** 눌렀을 때 열 방문 요청. */
  visitId: string;
};

/** 상태마다 알림 한 줄을 만든다. 보내기만 한 것은 알릴 것이 없다. */
function alertFor(r: VisitRequest): Alert | null {
  const at = r.createdAt ?? "";
  if (r.status === "confirmed" && r.confirmation) {
    return {
      id: `${r.id}:confirmed`,
      kind: "confirmed",
      title: "방문이 확정되었어요",
      body: `${r.confirmation.whenLabel}에 ${r.confirmation.staffName}을 ${r.confirmation.place}에서 만나요.`,
      at,
      visitId: r.id,
    };
  }
  if (r.status === "reschedule_proposed" && r.proposedTime) {
    return {
      id: `${r.id}:proposed`,
      kind: "proposed",
      title: "담당자가 다른 시간을 제안했어요",
      body: `${r.proposedTime}은 어떠신지 물어보셨어요.`,
      at,
      visitId: r.id,
    };
  }
  if (r.status === "cancelled") {
    return {
      id: `${r.id}:cancelled`,
      kind: "cancelled",
      title: "방문이 취소되었어요",
      body: r.cancelReason ?? "",
      at,
      visitId: r.id,
    };
  }
  return null;
}

export function toAlerts(requests: readonly VisitRequest[]): Alert[] {
  return requests
    .map(alertFor)
    .filter((a): a is Alert => a !== null)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** 마지막으로 본 시각보다 늦은 것을 센다. 한 번도 안 봤으면 전부다. */
export function countUnseen(alerts: readonly Alert[], lastSeen: string | null): number {
  if (lastSeen === null) return alerts.length;
  return alerts.filter((a) => a.at > lastSeen).length;
}
```

`VisitStatus`는 여섯 값이다 — `sent` · `acknowledged` · `confirmed` · `reschedule_proposed` · `completed` · `cancelled` (`src/shared/types/visit.ts`).

**`acknowledged`(담당자가 확인함)에는 알림을 만들지 않는다.** 이 상태에서 채팅방이 열리므로, 담당자가 말을 걸면 그때 메시지 알림이 나간다(Task 7). 확인만 하고 아무 말도 없는 것을 알림으로 내면 사용자가 열어 봐도 볼 것이 없다.

- [ ] **Step 5: 테스트가 통과하는 것을 확인한다**

```bash
npm test
```

기대: 6개가 모두 통과한다.

- [ ] **Step 6: 마지막으로 본 시각을 기기에 저장한다**

먼저 `src/shared/utils/storage.ts`에 읽고 쓰는 함수를 더한다. 이 파일은 지금 가입 여부 하나만 다루며 `localStorage`를 직접 쓴다. **같은 방식을 따른다.**

```ts
const ALERTS_SEEN_KEY = "majung365.alertsSeen";

/** 알림을 마지막으로 본 시각(ISO). 본 적이 없으면 null이다. */
export function lastAlertsSeen(): string | null {
  if (!hasLocalStorage()) return null;
  try {
    return window.localStorage.getItem(ALERTS_SEEN_KEY);
  } catch {
    return null;
  }
}

export function markAlertsSeen(at: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(ALERTS_SEEN_KEY, at);
  } catch {
    // 저장에 실패해도 화면 흐름은 막지 않는다(프라이빗 모드·용량 제한).
  }
}
```

`clearSignedUp`이 하는 일에 이 키도 더한다. **모든 정보를 지웠는데 알림 읽음 시각만 남으면 안 된다** (§9.4).

```ts
export function clearSignedUp(): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(SIGNED_UP_KEY);
    window.localStorage.removeItem(ALERTS_SEEN_KEY);
  } catch {
    // no-op
  }
}
```

그 다음 `src/features/alerts/hooks/useLastSeen.ts`를 만든다.

```ts
// 알림을 마지막으로 본 시각. **기기에만 둔다.**
//
// 서버에 두면 알림 읽음 상태가 개인정보로 한 줄 더 쌓인다. 기기를 바꾸면 알림이 다시
// 안 읽은 것으로 보이는데, 그것을 감수한다 (decision-log-2026-08-26.md A-3).
import { useCallback, useState } from "react";

import { lastAlertsSeen, markAlertsSeen } from "@/shared/utils/storage";

export function useLastSeen() {
  const [lastSeen, setLastSeen] = useState<string | null>(() => lastAlertsSeen());

  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    setLastSeen(now);
    markAlertsSeen(now);
  }, []);

  return { lastSeen, markSeen };
}
```

- [ ] **Step 7: 알림 화면을 만든다**

`src/features/alerts/views/AlertListScreen.tsx`를 만든다. 한 줄에 제목, 내용, 시각을 그리고, 안 읽은 것은 왼쪽에 점을 찍는다.

```tsx
import { Pressable, ScrollView, Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";

import type { Alert } from "../domain/alert";

export function AlertListScreen({
  alerts,
  lastSeen,
  onOpen,
}: {
  alerts: readonly Alert[];
  lastSeen: string | null;
  onOpen: (a: Alert) => void;
}) {
  if (alerts.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-page px-8">
        <Text className="text-center text-body text-ink-sub">
          아직 온 알림이 없어요.{"\n"}담당자가 답하면 여기로 알려드릴게요.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-page">
      {alerts.map((a) => {
        const unseen = lastSeen === null || a.at > lastSeen;
        return (
          <Pressable
            key={a.id}
            onPress={() => onOpen(a)}
            className="flex-row gap-3 border-b border-line px-5 py-4"
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                marginTop: 7,
                backgroundColor: unseen ? COLORS.alert : "transparent",
              }}
            />
            <View className="min-w-0 flex-1">
              <Text className="text-body font-bold text-ink-strong">{a.title}</Text>
              {a.body ? <Text className="mt-1 text-caption text-ink-sub">{a.body}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
```

- [ ] **Step 8: 알림 탭에 잇는다**

`src/app/(tabs)/alerts.tsx`를 고친다. 화면에 들어오면 본 것으로 표시한다.

```tsx
import { useEffect } from "react";
import { router } from "expo-router";

import { toAlerts } from "@/features/alerts/domain/alert";
import { useLastSeen } from "@/features/alerts/hooks/useLastSeen";
import { AlertListScreen } from "@/features/alerts/views/AlertListScreen";
import { useVisitRequests } from "@/features/visit/hooks/useVisitRequests";

export default function AlertsRoute() {
  const visit = useVisitRequests();
  const { lastSeen, markSeen } = useLastSeen();
  const alerts = toAlerts(visit.requests);

  // 화면을 떠날 때 본 것으로 표시한다. 들어오자마자 표시하면 방금 온 알림이
  // 눈에 띄기도 전에 점이 사라진다.
  useEffect(() => markSeen, [markSeen]);

  return (
    <AlertListScreen
      alerts={alerts}
      lastSeen={lastSeen}
      onOpen={() => router.push("/chats")}
    />
  );
}
```

- [ ] **Step 9: 타입·린트·테스트를 확인한다**

```bash
npx tsc --noEmit
npm run lint
npm test
```

- [ ] **Step 10: 화면으로 확인한다**

담당자 쪽에서 방문을 확정하면 사용자 알림 탭에 그 줄이 생기고, 왼쪽에 점이 찍혀 있다. 탭을 떠났다 돌아오면 점이 사라진다.

- [ ] **Step 11: 커밋**

```bash
git add -A
git commit -m "feat(alerts): 알림 탭 — 서버에 쌓지 않고 방문 상태로 만든다"
```

---

## Task 7: 안 읽은 건수 배지를 잇는다

이 작업은 **서버 변경이 배포된 뒤에** 한다. 그전까지 배지는 항상 0이라 그려지지 않는다.

**Files:**
- Modify: `Majung-Frontend/src/shared/types/visitRequest.ts` (서버 응답 타입)
- Modify: `Majung-Frontend/src/features/visit/domain/request.ts` (`VisitRequest`에 `unread` 추가)
- Modify: `Majung-Frontend/src/features/chat/domain/conversation.ts`
- Modify: `Majung-Frontend/src/features/alerts/domain/alert.ts`
- Modify: `Majung-Frontend/src/app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: `GET /api/visits` 응답의 새 필드 `unread: number`
- Produces: 하단 바의 알림·상담 칸에 숫자가 뜬다

- [ ] **Step 1: 서버에 필드가 왔는지 확인한다**

```bash
curl -s https://3-34-251-223.sslip.io/openapi.json | python -c "
import sys, json
props = json.load(sys.stdin)['components']['schemas']['VisitOut']['properties']
print('unread' in props and '있음' or '아직 없음')
"
```

기대: `있음`이 나온다. `아직 없음`이면 이 작업을 멈추고 `backend` 세션에 진행 상황을 확인한다.

- [ ] **Step 2: 타입에 필드를 더한다**

서버 응답 타입과 도메인 타입 양쪽에 더한다.

```ts
/** 담당자가 보냈는데 아직 안 읽은 메시지 수. 서버가 센다. */
unread: number;
```

응답을 도메인으로 옮기는 자리(`fromServer` 계열)에서도 그대로 넘긴다. **한쪽만 더하면 값이 `undefined`가 되어 배지가 안 뜬다.**

- [ ] **Step 3: 대화 목록과 알림에서 그 값을 쓴다**

`conversation.ts`의 담당자 대화에서 `unread: 0`을 `unread: r.unread`로 바꾼다.

`alert.ts`에 안 읽은 메시지 알림을 더한다.

```ts
  if (r.unread > 0) {
    return {
      id: `${r.id}:message`,
      kind: "message",
      title: "담당자가 메시지를 보냈어요",
      body: `안 읽은 메시지가 ${r.unread}개 있어요.`,
      at,
      visitId: r.id,
    };
  }
```

**이 판정을 상태 판정보다 앞에 둔다.** 확정된 요청에 새 메시지가 오면 메시지 쪽을 알려야 한다.

- [ ] **Step 4: 하단 바에 숫자를 넘긴다**

`_layout.tsx`에서 방문 요청을 읽어 두 칸에 숫자를 넘긴다.

```tsx
const visit = useVisitRequests();
const { lastSeen } = useLastSeen();
const alertCount = countUnseen(toAlerts(visit.requests), lastSeen);
const chatCount = visit.requests.reduce((sum, r) => sum + (r.unread ?? 0), 0);
```

```tsx
tabBarIcon: ({ color }) => <TabIcon name="bell" color={color} badge={alertCount} />,
```

상담은 원형 버튼이라 `ChatFabButton`에도 `badge`를 넘겨 원 오른쪽 위에 그린다.

- [ ] **Step 5: 타입·린트·테스트를 확인한다**

```bash
npx tsc --noEmit
npm run lint
npm test
```

- [ ] **Step 6: 화면으로 확인한다**

담당자가 메시지를 보내면 사용자 하단 바의 알림과 상담에 숫자가 뜬다. 대화를 열어 읽으면 숫자가 사라진다.

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat(nav): 안 읽은 건수를 하단 바에 띄운다"
```

---

## Task 8: 문서를 결정에 맞춘다

**Files:**
- Modify: `CLAUDE.md`
- Modify: `Majung-Frontend/CLAUDE.md` — **여기에도 같은 표가 있다.** "하단 5탭 네비게이션 → 단일 화면"과 "지도 화면(Google Maps 플랫폼 분기) → 지도 없음" 두 줄, 그리고 Tech Stack의 "Google Maps Geocoding API를 쓰지 않는다", 특수 규칙 8번을 함께 고친다
- Modify: `Majung-Frontend/src/app/_layout.tsx` (주석)
- Modify: `_bmad-output/specs/spec-majung-2nd/majung365_리뉴얼_개발플로_기획안_v2.md`

**Interfaces:**
- Consumes: `decision-log-2026-08-26.md`의 B-1·B-2
- Produces: 문서와 코드가 같은 말을 한다

- [ ] **Step 1: `CLAUDE.md`의 뒤집힌 표를 고친다**

"예선에서 뒤집힌 것" 표에서 두 줄을 고친다.

```markdown
| 5탭 네비게이션 | 단일 화면 + 서류철 인덱스 탭 아코디언 (§5.1) → **2026-08-26 되돌림.** 하단 메뉴바 다섯 칸을 되살린다. 아코디언은 홈 칸 안에 그대로 있다 (`decision-log-2026-08-26.md` B-1) |
| 지도 화면 (Google Maps) | 지도 없음 (§5.4) → **2026-08-26 되돌림.** 구글 지도를 넣는다. 좌표를 우리 서버로 보내지 않는 규칙은 그대로다 (`decision-log-2026-08-26.md` B-2) |
```

- [ ] **Step 2: 보안 규칙 6번에 단서를 더한다**

지금 문장은 "Google Maps Geocoding API를 쓰지 않는다"이다. 아래로 바꾼다.

```markdown
6. **위치 좌표를 우리 서버로 보내지 않는다** — 기기에서 시군구로 바꾸고 좌표는 버린다. **지도 표시를 위해 구글에 좌표가 가는 것은 2026-08-26에 허용했다**(`decision-log-2026-08-26.md` B-2). 우리 서버에 좌표를 저장하지 않는 규칙은 그대로다 (§5.4)
```

- [ ] **Step 3: 루트 레이아웃 주석을 고친다**

`src/app/_layout.tsx`의 주석에서 "본선은 단일 화면 + 아코디언 구조라 탭 네비게이션이 없다"를 고친다.

```tsx
// 루트 레이아웃. 하단 메뉴바는 `(tabs)/_layout.tsx`가 맡는다.
// 가입·상황 다시 알아보기·팜플렛·담당자 화면은 탭 밖에 있다 — 가입하는 중에
// 하단 바가 보이면 안 되기 때문이다.
```

- [ ] **Step 4: 기획서에 결정을 가리키는 줄을 넣는다**

§5.1과 §5.4 각각의 첫머리에 한 줄을 넣는다.

```markdown
> **2026-08-26에 이 절의 결정이 뒤집혔다.** `decision-log-2026-08-26.md`를 함께 본다.
```

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "docs: 하단 메뉴바와 지도 결정에 맞춰 계약 문서를 고친다"
```

---

## Task 9: 배포와 확인

**Files:**
- Modify: `vercel.json` (Task 3에서 이미 고쳤으면 확인만 한다)

- [ ] **Step 1: 전체 검사를 돌린다**

```bash
cd Majung-Frontend
npx tsc --noEmit
npm run lint
npm test
```

셋 다 통과해야 한다.

- [ ] **Step 2: 웹 빌드가 되는지 본다**

```bash
INCLUDE_ADMIN=1 npx expo export -p web
```

기대: `dist/`가 만들어지고 오류가 없다.

- [ ] **Step 3: 브랜치를 올리고 PR을 연다**

```bash
git push -u origin feat/bottom-tab-bar
gh pr create --base main --title "하단 메뉴바 다섯 칸 + 담당자 채팅 연결" --body "설계: docs/superpowers/specs/2026-08-26-bottom-tab-bar-design.md"
```

- [ ] **Step 4: 배포본이 실제로 최신인지 대조한다**

**배포 명령이 성공했다고 서버가 최신인 것은 아니다.** 배포 뒤 파일 해시를 대조한다.

```bash
curl -s https://majung365.vercel.app/ | grep -o 'index-[a-z0-9]*\.js' | head -1
ls Majung-Frontend/dist/_expo/static/js/web/ | head -3
```

- [ ] **Step 5: 배포판에서 마지막으로 확인한다**

| 확인 | 통과 조건 |
|---|---|
| 하단 바 | 다섯 칸이 눌리고 주소가 기존과 같다 |
| 홈 | 아코디언이 그대로 동작하고 중복 버튼이 없다 |
| 지도 | 위치를 켜면 지도와 마커가 뜨고, 거부하면 지역 고르기가 나온다 |
| 상담 | **담당자가 보낸 말이 사용자 화면에 보인다** |
| 상담 | 양쪽 모두 자기 말이 오른쪽에 붙는다 |
| 알림 | 방문이 확정되면 줄이 생기고 점이 찍힌다 |
| 짝 확인 | 담당자 쪽 기능마다 사용자 쪽 짝이 있다 |

---

## 남은 것 — 이번 계획에 넣지 않는다

| 항목 | 이유 |
|---|---|
| PC 사이드바(`DesktopShell`) 복구 | 도안이 모바일 기준이다. 필요해지면 별도 작업으로 되살린다 |
| 담당자 채팅 감사 로그 (코드 리뷰 M4) | 서버 작업이다. `backend` 세션에 요청한다 |
| 푸시 알림 | 기기 토큰을 서버에 저장해야 한다. §9.4 보관 대상이 늘어난다 |
| 즐겨찾기 저장 | 되살린 화면에 별 표시는 있으나 어디에 저장할지 정하지 않았다. 기기에 둘지 서버에 둘지 결정이 필요하다 |
