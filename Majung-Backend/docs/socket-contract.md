# 담당자 채팅 Socket.IO 계약 (§7.3)

> **이 문서가 정본이다.** 앞서 메시지로 전한 필드 이름 둘이 실제와 달랐고
> (`sender`→`senderRole`, `client_msg_id`→`clientMsgId`), 프론트가 실제 응답을
> 찍어 보고서야 발견했다. **이름이 어긋나면 오류가 나지 않고 `undefined`가 되어
> 말풍선이 전부 한쪽에 붙는다** — 조용히 틀리는 종류다.

## 왜 REST와 표기가 다른가

```
REST     snake_case   route_id · preferred_at_1 · client_msg_id
Socket   camelCase    routeId  · preferredAt1  · clientMsgId
```

REST는 Pydantic이 모델에서 자동으로 만들고, 소켓 페이로드는 손으로 쓴 dict다.
각자 그 자리의 관례를 따랐다. **통일하지 않은 것은 선택이며, 이미 붙은 화면을
고치는 비용이 얻는 것보다 크다고 판단했다.** 대신 이 문서로 남긴다.

## 접속

```js
const socket = io("https://3-34-251-223.sslip.io", {
  auth: { token: sessionToken },   // 출소자 토큰이든 담당자 토큰이든 이 자리
});
```

서버가 두 저장소를 각각 뒤져 누구인지 가린다. **한 곳에서 둘 다 처리하면 언젠가
출소자 토큰으로 관리자 화면이 열린다.**

토큰이 없거나 만료면 접속 자체가 거부된다(`ConnectionRefusedError`).
**토큰이 갱신되면 소켓 자격증명도 교체해야 한다** — 반영하지 않으면 재연결마다
만료된 토큰을 넘겨 조용히 채팅이 죽는다.

**전송 방식을 websocket으로 고정하지 않는다.** polling으로 붙은 뒤 승격하는
기본 동작을 그대로 둔다. 시설이나 회사 방화벽이 업그레이드를 막는 경우가 있다.

## 클라이언트 → 서버

### `join`

```js
socket.emit("join", { visitId }, (res) => { ... });
```

| 응답 | |
|---|---|
| `{ ok: true, messages: [...] }` | 입장 성공. **지난 대화가 함께 온다** — 따로 요청하지 않는다 |
| `{ ok: false, reason }` | 거절. `reason`을 그대로 화면에 쓴다 |

거절 사유는 넷뿐이고 전부 출소자에게 보일 것을 전제로 쓴 문구다.

```
"담당자가 아직 확인하지 않았어요. 확인하면 여기서 이야기할 수 있어요."
"이 요청은 끝나서 더 이야기할 수 없어요."
"요청을 찾을 수 없어요."
"지금은 이용할 수 없어요. 잠시 후 다시 시도해 주세요."
```

**세 번째를 다르게 표시하지 않는다.** 없는 요청과 남의 요청에 같은 문구를 쓴다 —
구분해 주면 남의 방 id를 찾는 데 쓰인다.

첫째와 둘째는 나눠 보여준다. **"아직"은 기다리면 되고 "끝났다"는 새 요청을
보내야 한다** — 사용자가 할 일이 다르다.

### `send_message`

```js
socket.emit("send_message", { body, clientMsgId }, (res) => { ... });
```

| 응답 | |
|---|---|
| `{ ok: true, id, resent: false }` | 새로 저장됨. 방 전체에 `new_message`가 나간다 |
| `{ ok: true, id, resent: true }` | **재전송.** 저장도 에코도 하지 않는다. `id`는 원본의 것 |
| `{ ok: false }` | 실패. `chat_error`가 함께 온다 |

`clientMsgId`는 선택이지만 **넣는 편이 맞다.** 낙관적 UI가 임시 말풍선과 서버
에코를 짝짓는 값이고, 같은 값으로 다시 보내면 서버가 재전송으로 보고 무시한다.
네트워크가 끊겨 다시 눌러도 대화가 두 번 쌓이지 않는다.

**서버는 보낸 사람에게도 에코를 보낸다.** 임시 말풍선을 확정 말풍선으로
교체하려면 그래야 한다.

거절되는 경우: 빈 내용, 2000자 초과(자르지 않고 거절한다 — 뒷부분이 조용히
사라지면 보낸 사람은 다 갔다고 믿는다), 닫힌 방.

### `mark_read`

```js
socket.emit("mark_read", {}, (res) => { ... });
```

방 전체에 `read_updated`가 나간다.

## 서버 → 클라이언트

### `new_message`

```json
{
  "id": "e50af497-...",
  "visitId": "24702de6-...",
  "senderRole": "staff",
  "body": "안녕하세요. 확인했습니다.",
  "createdAt": "2026-08-23T14:40:33.788529+00:00",
  "clientMsgId": "t-1"
}
```

`senderRole`은 `"user"` 또는 `"staff"`다. **사람이 아니라 역할로 둔다** —
담당자가 교체되어도 지난 대화의 "누가 말했나"는 바뀌면 안 된다.

`clientMsgId`는 보낸 쪽이 넣지 않았으면 빈 문자열이다.

### `read_updated`

```json
{ "role": "staff", "at": "2026-08-23T14:41:02.113+00:00" }
```

### `chat_error`

```json
{ "reason": "보내지 못했어요. 다시 시도해 주세요." }
```

`reason`을 그대로 화면에 쓴다.

## 방이 열리는 조건

**담당자가 확인하기 전에는 열지 않는다**(§7.3-4). 아무도 안 보는 방에 말을 걸게
두면, 답이 없는 것이 무시인지 아무도 못 본 것인지 사용자가 구분할 수 없다.

```
sent                 닫힘 — 담당자가 아직 확인 전
acknowledged         열림
confirmed            열림
reschedule_proposed  열림
completed            닫힘 — 끝남
cancelled            닫힘 — 끝남
```

담당자는 **배정된 개인이 아니라 기관 단위로** 들어온다. 확정 전에는 담당자가
정해지지 않았고, 확정 뒤에도 그 사람이 자리를 비우면 아무도 답하지 못한다.

## 시연용 상태 만들기

```
POST  /api/signup                    출소자 계정
POST  /api/visits                    방문 요청 (sent)
POST  /api/staff/login               admin1 / admin2
PATCH /api/staff/visits/{id}         { "status": "acknowledged" }   ← 여기서 열린다
```

확정까지 보려면 이어서 `{"status": "confirmed", "meeting_place": "..."}`를 보낸다.
**장소 없이 확정하면 400이다** — 시간만 정해지고 어디로 갈지 모르면 창구에서
다시 물어야 하고, 그 순간이 이 서비스가 없애려는 장벽이다.
