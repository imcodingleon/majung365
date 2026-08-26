# 채팅에서 약속 잡기 · 사진 첨부 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 담당자와 출소자가 대화하던 자리에서 만날 때를 정하고 사진을 주고받는다.

**Architecture:** 상태는 REST가 바꾸고 소켓은 "바뀌었다"만 알린다. 약속과 사진은 새 이벤트가 아니라 기존 `visit_message`의 `kind`로 가른다 — 대화의 한 줄이므로 순서·읽음·재전송이 전부 기존 규칙을 탄다.

**Tech Stack:** FastAPI · Supabase(Postgres + Storage) · python-socketio · Expo(React Native) + expo-router

**Spec:**
- `docs/superpowers/specs/2026-08-26-chat-schedule-confirm-design.md`
- `docs/superpowers/specs/2026-08-26-chat-photo-design.md`

## Global Constraints

- 서버 검사: `uv run ruff check .` 오류 0 · `uv run mypy app/` **기존 5건 유지**(늘리지 않는다) · `uv run pytest` **기존 6 failed / 373 passed 유지**
- 화면 검사: `npx tsc --noEmit` 오류 0 · `npx eslint src` **기존 12 errors / 11 warnings 유지** · `npx jest` 전부 통과
- 줄 길이 100자. `ruff`가 E501로 막는다
- **새 의존성은 `python-multipart` 하나뿐이다.** 그 밖에 추가 금지
- 화면에 "죄목"·"영역"을 쓰지 않는다. "설문"은 써도 된다
- 소켓 페이로드는 camelCase, REST는 snake_case (`Majung-Backend/docs/socket-contract.md`)
- 사용자 입력 원문을 로그에 남기지 않는다
- 커밋 메시지는 한국어. 무엇을 왜 바꿨는지 적는다

---

## File Structure

**서버**

| 파일 | 책임 |
|---|---|
| `migrations/0010_visit_message_kind.sql` (신규) | `kind`·`schedule` 추가, `body_enc` not null 해제 |
| `migrations/0011_visit_message_photo.sql` (신규) | `kind`에 `photo` 추가, `photo` 컬럼 |
| `app/domains/visit/domain/message.py` | `MessageKind`, `Schedule`, `Photo` 값 타입. `Message`에 필드 추가 |
| `app/domains/visit/domain/schedule.py` (신규) | 약속 카드의 버튼을 그릴지 판정 (순수 계산) |
| `app/domains/visit/infrastructure/message_repository.py` | `kind`·`schedule`·`photo` 읽고 쓰기 |
| `app/domains/visit/infrastructure/photo_storage.py` (신규) | Supabase Storage 업로드·다운로드·삭제 |
| `app/infrastructure/security/crypto.py` | `encrypt_bytes`·`decrypt_bytes` |
| `app/domains/visit/application/chat_usecase.py` | 약속 카드 쌓기, 사진 저장 판정 |
| `app/domains/visit/application/usecase.py` | 제안 시 장소 검증, 수락 |
| `app/domains/visit/adapter/inbound/api/router.py` | `POST /visits/{id}/accept`, 사진 두 창구 |
| `app/domains/visit/adapter/inbound/socket/notify.py` (신규) | 동기 핸들러에서 소켓 방송 |
| `app/domains/visit/adapter/inbound/socket/server.py` | `_payload`에 `kind`·`schedule`·`photo`, `app.state.sio` 노출 |
| `app/main.py` | 소켓 루프 확보, `photo_storage` 배선 |

**화면**

| 파일 | 책임 |
|---|---|
| `src/features/visit/domain/message.ts` (신규) | `ChatKind`·`Schedule`·`Photo` 타입, 버튼 판정 |
| `src/features/visit/hooks/useVisitChat.ts` | 새 필드 받기, 사진 올리기 |
| `src/features/visit/views/ScheduleCard.tsx` (신규) | 약속 카드 한 장 |
| `src/features/visit/views/PhotoBubble.tsx` (신규) | 사진 말풍선과 크게 보기 |
| `src/features/visit/views/StaffChatScreen.tsx` | 카드·사진·첨부 버튼 조립 |
| `src/features/visit/views/ProposeSheet.tsx` (신규) | 담당자가 때를 고르는 시트 |
| `src/shared/utils/api.ts` | `acceptVisit`·`uploadVisitPhoto`·`visitPhotoUrl` |

---

## Task 1: 바이트 암호화

**Files:**
- Modify: `Majung-Backend/app/infrastructure/security/crypto.py`
- Test: `Majung-Backend/tests/test_crypto_bytes.py` (신규)

**Interfaces:**
- Produces: `FieldCipher.encrypt_bytes(plaintext: bytes) -> bytes`, `FieldCipher.decrypt_bytes(stored: bytes) -> bytes`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`Majung-Backend/tests/test_crypto_bytes.py`

```python
"""사진 파일을 암호화한다 (2026-08-26 결정 I-2).

문자열 쪽(`encrypt`)과 같은 AES-256-GCM에 같은 키다. **base64를 씌우지 않는다** —
파일은 그대로 저장소에 올라가므로 33%를 부풀릴 이유가 없다.
"""

import os

import pytest

from app.infrastructure.security.crypto import CryptoError, FieldCipher

KEY = os.urandom(32)
OTHER_KEY = os.urandom(32)


def test_roundtrip() -> None:
    cipher = FieldCipher(key=KEY)
    photo = os.urandom(2048)
    assert cipher.decrypt_bytes(cipher.encrypt_bytes(photo)) == photo


def test_empty_bytes_survive() -> None:
    """0바이트 파일도 다룬다. 거절은 창구가 하지 암호화가 하지 않는다."""
    cipher = FieldCipher(key=KEY)
    assert cipher.decrypt_bytes(cipher.encrypt_bytes(b"")) == b""


def test_other_key_cannot_read() -> None:
    sealed = FieldCipher(key=KEY).encrypt_bytes(b"hello")
    with pytest.raises(CryptoError):
        FieldCipher(key=OTHER_KEY).decrypt_bytes(sealed)


def test_one_changed_byte_is_refused() -> None:
    """GCM이 무결성까지 본다. 조용히 깨진 사진이 나오지 않는다."""
    sealed = bytearray(FieldCipher(key=KEY).encrypt_bytes(b"hello world"))
    sealed[-1] ^= 0x01
    with pytest.raises(CryptoError):
        FieldCipher(key=KEY).decrypt_bytes(bytes(sealed))


def test_not_base64() -> None:
    """**base64를 씌우지 않는다.** 씌우면 저장소에 올라가는 크기가 33% 는다."""
    sealed = FieldCipher(key=KEY).encrypt_bytes(b"x" * 1000)
    # 논스 12바이트 + 본문 1000 + 태그 16 = 1028. base64였다면 1372를 넘는다.
    assert len(sealed) == 12 + 1000 + 16
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd Majung-Backend && uv run pytest tests/test_crypto_bytes.py -q`
Expected: FAIL — `AttributeError: 'FieldCipher' object has no attribute 'encrypt_bytes'`

- [ ] **Step 3: 최소 구현**

`app/infrastructure/security/crypto.py`의 `decrypt` 아래에 더한다.

```python
    def encrypt_bytes(self, plaintext: bytes) -> bytes:
        """파일용. **base64를 씌우지 않는다** — 그대로 저장소에 올라가므로
        33%를 부풀릴 이유가 없다. 논스를 앞에 붙이는 것은 문자열 쪽과 같다."""
        if plaintext is None:
            raise CryptoError("빈 값을 암호화할 수 없다")
        nonce = os.urandom(_NONCE_BYTES)
        return nonce + AESGCM(self.key).encrypt(nonce, plaintext, None)

    def decrypt_bytes(self, stored: bytes) -> bytes:
        """복호화. 변조되었거나 다른 키로 암호화된 값이면 예외를 낸다."""
        try:
            nonce, sealed = stored[:_NONCE_BYTES], stored[_NONCE_BYTES:]
            return AESGCM(self.key).decrypt(nonce, sealed, None)
        except (InvalidTag, ValueError, TypeError) as exc:
            # 원문도 키도 예외 메시지에 담지 않는다 — 로그로 흘러간다.
            raise CryptoError("복호화에 실패했다") from exc
```

- [ ] **Step 4: 통과를 확인한다**

Run: `uv run pytest tests/test_crypto_bytes.py -q`
Expected: PASS (5 passed)

- [ ] **Step 5: 검사와 커밋**

```bash
uv run ruff check . && uv run mypy app/
git add app/infrastructure/security/crypto.py tests/test_crypto_bytes.py
git commit -m "feat(crypto): 파일을 암호화할 바이트용 짝을 더한다

사진을 저장소에 올리기 전에 암호화한다. 문자열 쪽과 같은 AES-256-GCM에 같은
키이며, base64를 안 씌우는 것만 다르다 — 파일은 그대로 올라가므로 33%를
부풀릴 이유가 없다."
```

---

## Task 2: 메시지 종류 — 스키마와 도메인

**Files:**
- Create: `Majung-Backend/migrations/0010_visit_message_kind.sql`
- Create: `Majung-Backend/migrations/0011_visit_message_photo.sql`
- Modify: `Majung-Backend/app/domains/visit/domain/message.py`
- Test: `Majung-Backend/tests/test_message_kind.py` (신규)

**Interfaces:**
- Produces: `MessageKind` (StrEnum: `TEXT`·`PROPOSED`·`CONFIRMED`·`CANCELLED`·`PHOTO`), `Schedule(at: datetime, place: str, staff_name: str)`, `Photo(path: str, bytes_: int, mime: str)`, `Message.kind`·`Message.schedule`·`Message.photo`

- [ ] **Step 1: 마이그레이션 둘을 쓴다**

`migrations/0010_visit_message_kind.sql`

```sql
-- 약속 카드를 대화에 남긴다 (2026-08-26 결정 I-1).
--
-- 중고 거래 앱에서 만날 약속을 잡는 것과 같은 모양이다. 제안·확정·취소가 대화
-- 흐름에 카드로 서고, 위로 올려 보면 언제 무엇을 정했는지 그대로 보인다.
--
-- **`body_enc`의 not null을 푼다.** 약속 카드에는 사람이 쓴 본문이 없다. 빈
-- 문자열을 암호화해 넣으면 "본문이 있는 척"이 되고, 읽는 코드가 빈 말풍선을 그린다.

alter table visit_message
  add column if not exists kind text not null default 'text'
    check (kind in ('text', 'proposed', 'confirmed', 'cancelled')),
  add column if not exists schedule jsonb;

alter table visit_message
  alter column body_enc drop not null;

comment on column visit_message.kind is
  '메시지 종류. text는 사람이 쓴 말, 나머지는 약속 카드다.';
comment on column visit_message.schedule is
  '약속 카드의 내용 {at, place, staffName}. **평문이다** — 같은 값이 '
  'visit_request에 이미 평문으로 있어서 한쪽만 암호화하면 읽는 길만 둘로 갈린다.';
```

`migrations/0011_visit_message_photo.sql`

```sql
-- 담당자 채팅에 사진을 붙인다 (2026-08-26 결정 I-3).
--
-- **0005의 "이미지를 넣지 않는다"를 뒤집는다.** 팀 회의 결정이다. 담당자가
-- "출소증명서 사진 보내 주세요"라고 하는 것이 실제 상담에서 일어나는 일이고,
-- 말로만 주고받게 두면 사용자가 창구까지 한 번 더 가야 한다.
--
-- 막았던 이유는 사라지지 않는다 — 서버에 출소자의 서류 사진이 쌓인다.
-- 파일은 Supabase Storage 비공개 버킷에 **암호화해** 넣는다.

alter table visit_message
  drop constraint if exists visit_message_kind_check;

alter table visit_message
  add constraint visit_message_kind_check
    check (kind in ('text', 'proposed', 'confirmed', 'cancelled', 'photo'));

alter table visit_message
  add column if not exists photo jsonb;

comment on column visit_message.photo is
  '사진의 자리와 크기 {path, bytes, mime}. **평문이다** — 경로와 크기는 사진의 '
  '내용이 아니다. 내용은 저장소 안에서 암호화되어 있다.';
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`Majung-Backend/tests/test_message_kind.py`

```python
"""메시지 종류 (2026-08-26 결정 I-1·I-3).

**약속 카드와 사진도 대화의 한 줄이다.** 따로 관리하는 목록이 아니라서 순서·읽음·
재전송이 전부 기존 대화 규칙을 탄다.
"""

from datetime import UTC, datetime
from uuid import uuid4

from app.domains.visit.domain.message import (
    Message,
    MessageKind,
    Photo,
    Schedule,
    SenderRole,
)


def _message(**over: object) -> Message:
    base = {
        "id": uuid4(),
        "visit_id": uuid4(),
        "sender_role": SenderRole.STAFF,
        "body": "",
        "created_at": datetime(2026, 8, 26, 5, 0, tzinfo=UTC),
    }
    base.update(over)
    return Message(**base)  # type: ignore[arg-type]


def test_a_plain_message_is_text() -> None:
    """**옛 행에는 kind가 없다.** 기본이 text여야 지난 대화가 그대로 보인다."""
    assert _message(body="안녕하세요").kind is MessageKind.TEXT


def test_schedule_card_carries_when_and_where() -> None:
    at = datetime(2026, 8, 28, 5, 0, tzinfo=UTC)
    card = _message(
        kind=MessageKind.PROPOSED,
        schedule=Schedule(at=at, place="2층 상담실", staff_name="최다은"),
    )
    assert card.schedule is not None
    assert card.schedule.at == at
    assert card.schedule.place == "2층 상담실"


def test_photo_carries_path_and_size() -> None:
    shot = _message(
        sender_role=SenderRole.USER,
        kind=MessageKind.PHOTO,
        photo=Photo(path="v1/m1", bytes_=1843200, mime="image/jpeg"),
    )
    assert shot.photo is not None
    assert shot.photo.path == "v1/m1"
    assert shot.photo.bytes_ == 1843200


def test_a_card_has_no_body() -> None:
    """약속 카드에는 사람이 쓴 본문이 없다. 빈 문자열이 정상이다."""
    assert _message(kind=MessageKind.CONFIRMED).body == ""
```

- [ ] **Step 3: 실패를 확인한다**

Run: `uv run pytest tests/test_message_kind.py -q`
Expected: FAIL — `ImportError: cannot import name 'MessageKind'`

- [ ] **Step 4: 도메인 타입을 더한다**

`app/domains/visit/domain/message.py`의 `class Message` 위에 더한다.

```python
class MessageKind(StrEnum):
    """대화 한 줄의 종류.

    **약속 카드와 사진도 대화의 한 줄이다.** 따로 관리하는 목록으로 두면 순서를
    화면이 스스로 맞춰야 하고, 그 자리에서 카드가 엉뚱한 데 끼어든다.
    """

    TEXT = "text"  # 사람이 쓴 말
    PROPOSED = "proposed"  # 담당자가 만날 때를 제안했다
    CONFIRMED = "confirmed"  # 약속이 잡혔다
    CANCELLED = "cancelled"  # 약속이 취소됐다
    PHOTO = "photo"


@dataclass(frozen=True)
class Schedule:
    """약속 카드에 적히는 것. **평문으로 저장한다** — 같은 값이 `visit_request`에
    이미 평문으로 있어서, 한쪽만 암호화하면 읽는 길만 둘로 갈린다."""

    at: datetime
    place: str
    staff_name: str


@dataclass(frozen=True)
class Photo:
    """사진의 자리와 크기. **내용은 저장소 안에서 암호화되어 있다.**

    `bytes_`에 밑줄이 붙은 것은 `bytes`가 파이썬 내장 이름이기 때문이다.
    """

    path: str
    bytes_: int
    mime: str
```

`Message`에 필드 셋을 더한다 (기본값이 있어야 옛 호출부가 그대로 돈다).

```python
    kind: MessageKind = MessageKind.TEXT
    schedule: Schedule | None = None
    photo: Photo | None = None
```

`from enum import StrEnum`이 없으면 더한다.

- [ ] **Step 5: 통과를 확인한다**

Run: `uv run pytest tests/test_message_kind.py -q`
Expected: PASS (4 passed)

- [ ] **Step 6: 마이그레이션을 적용한다**

Supabase MCP `apply_migration`으로 `0010`, `0011`을 순서대로 적용한다
(project_id `jaqcgcysacajbjitdrnx`). **`0010`이 먼저다** — `0011`이 `0010`의
제약을 지우고 다시 만든다.

- [ ] **Step 7: 검사와 커밋**

```bash
uv run ruff check . && uv run mypy app/ && uv run pytest -q
git add migrations/0010_visit_message_kind.sql migrations/0011_visit_message_photo.sql \
        app/domains/visit/domain/message.py tests/test_message_kind.py
git commit -m "feat(chat): 대화 한 줄에 종류를 둔다 — 약속 카드와 사진

약속 카드와 사진도 대화의 한 줄이다. 따로 관리하는 목록으로 두면 순서를 화면이
스스로 맞춰야 하고, 그 자리에서 카드가 엉뚱한 데 끼어든다.

body_enc의 not null을 푼다 — 약속 카드에는 사람이 쓴 본문이 없고, 빈 문자열을
암호화해 넣으면 본문이 있는 척이 된다."
```

---

## Task 3: 버튼을 그릴지 판정

**Files:**
- Create: `Majung-Backend/app/domains/visit/domain/schedule.py`
- Test: `Majung-Backend/tests/test_schedule_card.py` (신규)

**Interfaces:**
- Consumes: `MessageKind`, `Message` (Task 2)
- Produces: `answerable_card_id(messages: list[Message], status: VisitStatus) -> UUID | None`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`Majung-Backend/tests/test_schedule_card.py`

```python
"""약속 카드의 버튼을 그릴지 (2026-08-26 결정 I-1).

**버튼을 저장하지 않는다.** 카드에 "답했음" 같은 값을 넣으면 상태와 어긋날 수 있고,
어긋나면 지난 카드의 버튼이 다시 살아난다. 지금 요청 상태로 판정한다.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from app.domains.visit.domain.entity import VisitStatus
from app.domains.visit.domain.message import (
    Message,
    MessageKind,
    Schedule,
    SenderRole,
)
from app.domains.visit.domain.schedule import answerable_card_id

BASE = datetime(2026, 8, 26, 5, 0, tzinfo=UTC)


def _card(kind: MessageKind, minutes: int, at_id: UUID | None = None) -> Message:
    return Message(
        id=at_id or uuid4(),
        visit_id=uuid4(),
        sender_role=SenderRole.STAFF,
        body="",
        created_at=BASE + timedelta(minutes=minutes),
        kind=kind,
        schedule=Schedule(at=BASE, place="2층 상담실", staff_name="최다은"),
    )


def test_the_last_proposal_is_answerable() -> None:
    wanted = uuid4()
    messages = [_card(MessageKind.PROPOSED, 0), _card(MessageKind.PROPOSED, 5, wanted)]
    assert answerable_card_id(messages, VisitStatus.RESCHEDULE_PROPOSED) == wanted


def test_an_earlier_proposal_is_not() -> None:
    """제안이 둘 쌓이면 앞 카드에는 버튼이 없다."""
    first = uuid4()
    messages = [_card(MessageKind.PROPOSED, 0, first), _card(MessageKind.PROPOSED, 5)]
    assert answerable_card_id(messages, VisitStatus.RESCHEDULE_PROPOSED) != first


def test_nothing_is_answerable_once_confirmed() -> None:
    """수락하고 나면 버튼이 사라진다. 두 번 수락할 일이 없다."""
    messages = [_card(MessageKind.PROPOSED, 0), _card(MessageKind.CONFIRMED, 5)]
    assert answerable_card_id(messages, VisitStatus.CONFIRMED) is None


def test_nothing_is_answerable_once_cancelled() -> None:
    messages = [_card(MessageKind.PROPOSED, 0)]
    assert answerable_card_id(messages, VisitStatus.CANCELLED) is None


def test_text_messages_are_not_cards() -> None:
    """사람이 쓴 말에는 버튼이 붙지 않는다."""
    messages = [_card(MessageKind.TEXT, 0)]
    assert answerable_card_id(messages, VisitStatus.RESCHEDULE_PROPOSED) is None


def test_order_comes_from_time_not_position() -> None:
    """**저장소가 시간순으로 준다는 것에 기대지 않는다.** 그 약속이 한 번 어긋나면
    엉뚱한 카드에 버튼이 붙는데, 화면에서는 그것이 틀린 줄 알 수 없다."""
    wanted = uuid4()
    messages = [_card(MessageKind.PROPOSED, 9, wanted), _card(MessageKind.PROPOSED, 1)]
    assert answerable_card_id(messages, VisitStatus.RESCHEDULE_PROPOSED) == wanted


def test_no_messages_is_not_an_error() -> None:
    assert answerable_card_id([], VisitStatus.RESCHEDULE_PROPOSED) is None
```

- [ ] **Step 2: 실패를 확인한다**

Run: `uv run pytest tests/test_schedule_card.py -q`
Expected: FAIL — `ModuleNotFoundError: app.domains.visit.domain.schedule`

- [ ] **Step 3: 최소 구현**

`app/domains/visit/domain/schedule.py`

```python
"""약속 카드의 버튼을 그릴지 판정한다 — 순수 Python (Domain).

**버튼을 저장하지 않는다.** 카드에 "답했음" 같은 값을 넣으면 상태와 어긋날 수 있고,
어긋나면 지난 카드의 버튼이 다시 살아난다. 지금 요청 상태로 판정한다.
"""

from uuid import UUID

from app.domains.visit.domain.entity import VisitStatus
from app.domains.visit.domain.message import Message, MessageKind


def answerable_card_id(
    messages: list[Message], status: VisitStatus
) -> UUID | None:
    """지금 답할 수 있는 제안 카드. 없으면 None.

    답할 수 있는 것은 **마지막 제안 하나뿐이고**, 요청이 아직 그 제안을 기다리는
    상태일 때만이다. 확정됐거나 취소됐으면 아무 카드에도 버튼이 없다.

    **시간으로 마지막을 고른다.** 저장소가 시간순으로 준다는 것에 기대지 않는다 —
    그 약속이 한 번 어긋나면 엉뚱한 카드에 버튼이 붙고, 화면에서는 그것이 틀린 줄
    알 수 없다.
    """
    if status is not VisitStatus.RESCHEDULE_PROPOSED:
        return None
    proposals = [m for m in messages if m.kind is MessageKind.PROPOSED]
    if not proposals:
        return None
    return max(proposals, key=lambda m: m.created_at).id
```

- [ ] **Step 4: 통과를 확인한다**

Run: `uv run pytest tests/test_schedule_card.py -q`
Expected: PASS (7 passed)

- [ ] **Step 5: 검사와 커밋**

```bash
uv run ruff check . && uv run mypy app/
git add app/domains/visit/domain/schedule.py tests/test_schedule_card.py
git commit -m "feat(visit): 약속 카드의 버튼은 저장하지 않고 상태로 판정한다

카드에 '답했음'을 저장하면 상태와 어긋날 수 있고, 어긋나면 지난 카드의 버튼이
다시 살아난다. 마지막 제안이고 요청이 그 제안을 기다릴 때만 참이다.

시간으로 마지막을 고른다 — 저장소가 시간순으로 준다는 것에 기대지 않는다."
```

---

## Task 4: 저장소가 새 필드를 읽고 쓴다

**Files:**
- Modify: `Majung-Backend/app/domains/visit/infrastructure/message_repository.py`
- Test: `Majung-Backend/tests/test_message_repository_rows.py` (신규)

**Interfaces:**
- Consumes: `MessageKind`·`Schedule`·`Photo`·`Message` (Task 2)
- Produces: `SupabaseMessageRepository.add(..., kind: MessageKind = MessageKind.TEXT, schedule: Schedule | None = None, photo: Photo | None = None)`, `_to_entity`가 새 필드를 채운다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

행 하나를 엔티티로 옮기는 것은 순수 계산이라 DB 없이 시험한다.

`Majung-Backend/tests/test_message_repository_rows.py`

```python
"""저장된 행을 대화 한 줄로 옮긴다.

**본문이 없는 줄이 사라지면 안 된다.** 약속 카드와 사진에는 사람이 쓴 본문이 없어서,
복호화 실패와 같은 취급을 하면 카드가 통째로 대화에서 빠진다.
"""

import os
from datetime import UTC, datetime
from uuid import uuid4

from app.domains.visit.domain.message import MessageKind
from app.domains.visit.infrastructure.message_repository import (
    SupabaseMessageRepository,
)
from app.infrastructure.security.crypto import FieldCipher

CIPHER = FieldCipher(key=os.urandom(32))
NOW = datetime(2026, 8, 26, 5, 0, tzinfo=UTC).isoformat()


def _repo() -> SupabaseMessageRepository:
    # DB에 닿지 않는 변환만 시험한다. 클라이언트 자리는 쓰이지 않는다.
    return SupabaseMessageRepository(None, CIPHER)  # type: ignore[arg-type]


def _row(**over: object) -> dict[str, object]:
    base = {
        "id": str(uuid4()),
        "visit_id": str(uuid4()),
        "sender_role": "staff",
        "body_enc": CIPHER.encrypt("안녕하세요"),
        "created_at": NOW,
        "client_msg_id": None,
        "sender_staff_id": None,
        "kind": "text",
        "schedule": None,
        "photo": None,
    }
    base.update(over)
    return base


def test_a_row_without_kind_is_text() -> None:
    """**옛 행에는 kind가 없다.** 지난 대화가 그대로 보여야 한다."""
    row = _row()
    del row["kind"]
    got = _repo()._to_entity(row)
    assert got is not None and got.kind is MessageKind.TEXT


def test_a_schedule_card_survives_an_empty_body() -> None:
    got = _repo()._to_entity(
        _row(
            body_enc=None,
            kind="proposed",
            schedule={"at": NOW, "place": "2층 상담실", "staffName": "최다은"},
        )
    )
    assert got is not None
    assert got.kind is MessageKind.PROPOSED
    assert got.body == ""
    assert got.schedule is not None and got.schedule.place == "2층 상담실"


def test_a_photo_row_survives_an_empty_body() -> None:
    got = _repo()._to_entity(
        _row(
            body_enc=None,
            sender_role="user",
            kind="photo",
            photo={"path": "v1/m1", "bytes": 1843200, "mime": "image/jpeg"},
        )
    )
    assert got is not None
    assert got.photo is not None and got.photo.bytes_ == 1843200


def test_a_broken_body_still_drops_the_row() -> None:
    """본문이 있는데 못 읽는 것은 다른 이야기다. 빈 말풍선을 보이지 않는다."""
    assert _repo()._to_entity(_row(body_enc="이건 암호문이 아니다")) is None


def test_an_unknown_kind_reads_as_text() -> None:
    """서버가 앞서 나가 새 종류를 넣어도 대화가 안 깨진다."""
    got = _repo()._to_entity(_row(kind="something-new"))
    assert got is not None and got.kind is MessageKind.TEXT
```

- [ ] **Step 2: 실패를 확인한다**

Run: `uv run pytest tests/test_message_repository_rows.py -q`
Expected: FAIL — `AttributeError: 'Message' object has no attribute 'kind'`가 아니라
`TypeError` 또는 `KeyError`. 어느 쪽이든 실패해야 한다.

- [ ] **Step 3: `_to_entity`를 고친다**

```python
    def _to_entity(self, row: dict[str, Any]) -> Message | None:
        kind = _kind_of(row.get("kind"))
        raw_body = row.get("body_enc")
        # **본문이 없는 줄이 정상이다.** 약속 카드와 사진에는 사람이 쓴 말이 없다.
        # 복호화 실패와 같은 취급을 하면 카드가 통째로 대화에서 빠진다.
        if raw_body is None:
            body = ""
        else:
            try:
                body = self._cipher.decrypt(str(raw_body))
            except CryptoError:
                # 한 건이 깨졌다고 대화 전체가 안 열리면 안 된다. 다만 빈 말풍선을
                # 보여주면 상대가 무엇을 보냈는지 오해하므로 아예 뺀다.
                logger.warning("채팅 메시지를 읽지 못했다 — id=%s", row.get("id"))
                return None
        return Message(
            id=UUID(str(row["id"])),
            visit_id=UUID(str(row["visit_id"])),
            sender_role=SenderRole(str(row["sender_role"])),
            body=body,
            created_at=_parse_ts(str(row["created_at"])),
            client_msg_id=str(row.get("client_msg_id") or ""),
            sender_staff_id=(
                UUID(str(row["sender_staff_id"])) if row.get("sender_staff_id") else None
            ),
            kind=kind,
            schedule=_schedule_of(row.get("schedule")),
            photo=_photo_of(row.get("photo")),
        )
```

파일 위쪽(`_parse_ts` 옆)에 읽는 함수 셋을 더한다.

```python
def _kind_of(raw: object) -> MessageKind:
    """모르는 종류는 사람이 쓴 말로 읽는다.

    서버가 앞서 나가 새 종류를 넣어도 대화가 안 깨진다. 옛 행에는 이 값이 아예 없다.
    """
    try:
        return MessageKind(str(raw))
    except ValueError:
        return MessageKind.TEXT


def _schedule_of(raw: object) -> Schedule | None:
    if not isinstance(raw, dict):
        return None
    at = raw.get("at")
    if not at:
        return None
    return Schedule(
        at=_parse_ts(str(at)),
        place=str(raw.get("place") or ""),
        staff_name=str(raw.get("staffName") or ""),
    )


def _photo_of(raw: object) -> Photo | None:
    if not isinstance(raw, dict):
        return None
    path = raw.get("path")
    if not path:
        return None
    return Photo(
        path=str(path),
        bytes_=int(raw.get("bytes") or 0),
        mime=str(raw.get("mime") or "application/octet-stream"),
    )
```

- [ ] **Step 4: `add`가 새 필드를 쓰게 한다**

서명에 인자 셋을 더하고 `insert`의 dict를 고친다.

```python
    def add(
        self,
        *,
        visit_id: UUID,
        sender_role: SenderRole,
        body: str,
        client_msg_id: str = "",
        sender_staff_id: UUID | None = None,
        kind: MessageKind = MessageKind.TEXT,
        schedule: Schedule | None = None,
        photo: Photo | None = None,
    ) -> tuple[Message, bool]:
```

`insert` 안:

```python
                {
                    "visit_id": str(visit_id),
                    "sender_role": sender_role.value,
                    "sender_staff_id": str(sender_staff_id) if sender_staff_id else None,
                    # **본문이 없으면 넣지 않는다.** 빈 문자열을 암호화해 넣으면
                    # "본문이 있는 척"이 되고, 읽는 쪽이 빈 말풍선을 그린다.
                    "body_enc": self._cipher.encrypt(body) if body else None,
                    "client_msg_id": client_msg_id or None,
                    "kind": kind.value,
                    "schedule": (
                        {
                            "at": schedule.at.isoformat(),
                            "place": schedule.place,
                            "staffName": schedule.staff_name,
                        }
                        if schedule
                        else None
                    ),
                    "photo": (
                        {"path": photo.path, "bytes": photo.bytes_, "mime": photo.mime}
                        if photo
                        else None
                    ),
                }
```

임포트에 `MessageKind`·`Photo`·`Schedule`을 더한다.

- [ ] **Step 5: 통과를 확인한다**

Run: `uv run pytest tests/test_message_repository_rows.py -q`
Expected: PASS (5 passed)

- [ ] **Step 6: 검사와 커밋**

```bash
uv run ruff check . && uv run mypy app/ && uv run pytest -q
git add app/domains/visit/infrastructure/message_repository.py \
        tests/test_message_repository_rows.py
git commit -m "feat(chat): 저장소가 약속 카드와 사진을 읽고 쓴다

본문이 없는 줄이 정상이다 — 약속 카드와 사진에는 사람이 쓴 말이 없다. 복호화
실패와 같은 취급을 하면 카드가 통째로 대화에서 빠진다.

모르는 종류는 text로 읽는다. 서버가 앞서 나가 새 종류를 넣어도 대화가 안 깨진다."
```

---

## Task 5: 소켓이 새 필드를 내보낸다

**Files:**
- Modify: `Majung-Backend/app/domains/visit/adapter/inbound/socket/server.py`
- Modify: `Majung-Backend/docs/socket-contract.md`
- Test: `Majung-Backend/tests/test_socket_payload.py` (신규)

**Interfaces:**
- Consumes: `Message`·`MessageKind`·`Schedule`·`Photo` (Task 2)
- Produces: `_payload(message) -> dict`에 `kind`·`schedule`·`photo`. `app.state.sio`로 서버 인스턴스를 밖에 내준다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`Majung-Backend/tests/test_socket_payload.py`

```python
"""소켓으로 나가는 대화 한 줄.

표기는 camelCase다 (`docs/socket-contract.md`). **이름이 어긋나면 오류가 나지 않고
undefined가 되어** 말풍선이 전부 한쪽에 붙는다 — 조용히 틀리는 종류다.
"""

from datetime import UTC, datetime
from uuid import uuid4

from app.domains.visit.adapter.inbound.socket.server import _payload
from app.domains.visit.domain.message import (
    Message,
    MessageKind,
    Photo,
    Schedule,
    SenderRole,
)

AT = datetime(2026, 8, 28, 5, 0, tzinfo=UTC)


def _message(**over: object) -> Message:
    base = {
        "id": uuid4(),
        "visit_id": uuid4(),
        "sender_role": SenderRole.STAFF,
        "body": "",
        "created_at": AT,
    }
    base.update(over)
    return Message(**base)  # type: ignore[arg-type]


def test_a_plain_message_says_text() -> None:
    got = _payload(_message(body="안녕하세요"))
    assert got["kind"] == "text"
    assert got["body"] == "안녕하세요"


def test_a_schedule_card_goes_out_in_camel_case() -> None:
    got = _payload(
        _message(
            kind=MessageKind.PROPOSED,
            schedule=Schedule(at=AT, place="2층 상담실", staff_name="최다은"),
        )
    )
    assert got["kind"] == "proposed"
    assert got["schedule"] == {
        "at": AT.isoformat(),
        "place": "2층 상담실",
        "staffName": "최다은",
    }


def test_a_photo_does_not_leak_its_path() -> None:
    """**저장소 안의 자리를 클라이언트가 알 이유가 없다.** 화면은 messageId로 받는다."""
    got = _payload(
        _message(
            sender_role=SenderRole.USER,
            kind=MessageKind.PHOTO,
            photo=Photo(path="v1/m1", bytes_=1843200, mime="image/jpeg"),
        )
    )
    assert got["photo"] == {"bytes": 1843200, "mime": "image/jpeg"}
    assert "path" not in got["photo"]


def test_absent_fields_are_null_not_missing() -> None:
    """키가 아예 없으면 옛 화면이 undefined를 만난다. null로 자리를 잡아 둔다."""
    got = _payload(_message(body="안녕하세요"))
    assert got["schedule"] is None
    assert got["photo"] is None
```

- [ ] **Step 2: 실패를 확인한다**

Run: `uv run pytest tests/test_socket_payload.py -q`
Expected: FAIL — `KeyError: 'kind'`

- [ ] **Step 3: `_payload`를 고친다**

```python
def _payload(message: Message) -> dict[str, Any]:
    return {
        "id": str(message.id),
        "visitId": str(message.visit_id),
        "senderRole": message.sender_role.value,
        # 대화 한 줄의 종류. 옛 화면은 이 값을 모르니 text로 보고 그린다.
        "kind": message.kind.value,
        "body": message.body,
        "schedule": (
            {
                "at": message.schedule.at.isoformat(),
                "place": message.schedule.place,
                "staffName": message.schedule.staff_name,
            }
            if message.schedule
            else None
        ),
        # **`path`를 내보내지 않는다.** 화면은 messageId로 받아 오면 되고,
        # 저장소 안의 자리를 클라이언트가 알 이유가 없다.
        "photo": (
            {"bytes": message.photo.bytes_, "mime": message.photo.mime}
            if message.photo
            else None
        ),
        "createdAt": message.created_at.isoformat(),
        # 클라이언트가 임시 말풍선과 짝짓는 값. 없으면 빈 문자열이다.
        "clientMsgId": message.client_msg_id,
    }
```

- [ ] **Step 4: `sio`를 밖에 내준다**

`create_socket_app` 안, `sio = socketio.AsyncServer(...)` 바로 아래에 더한다.

```python
    # **REST 핸들러가 방송할 수 있게 내준다** (결정 I-1). 상태를 바꾸는 것은 REST이고
    # 소켓은 "바뀌었다"만 알린다 — 소켓이 상태를 바꾸면 규칙이 두 곳에 생긴다.
    app.state.sio = sio
```

- [ ] **Step 5: 통과를 확인한다**

Run: `uv run pytest tests/test_socket_payload.py -q`
Expected: PASS (4 passed)

- [ ] **Step 6: 계약 문서를 갱신한다**

`docs/socket-contract.md`의 `new_message` 절을 고친다. 예시 JSON에 `kind`·`schedule`·
`photo`를 넣고, 그 아래에 이 문단을 더한다.

```markdown
`kind`는 `"text"` · `"proposed"` · `"confirmed"` · `"cancelled"` · `"photo"`다.
**모르는 값이 오면 `"text"`로 본다** — 서버가 앞서 나가도 대화가 안 깨진다.

`schedule`은 약속 카드에만, `photo`는 사진에만 실린다. 나머지는 `null`이다.
**키를 빼지 않고 `null`로 둔다** — 없으면 옛 화면이 `undefined`를 만난다.

`photo`에 저장소 경로가 없다. 사진은 `GET /api/visits/{id}/photos/{messageId}`로
받는다 — 서명 URL을 페이로드에 실으면 만료를 관리할 수 없고 로그에도 남는다.
```

같은 문서의 `join` 응답 절에 "`messages`의 각 줄도 같은 모양이다" 한 줄을 더한다.

- [ ] **Step 7: 검사와 커밋**

```bash
uv run ruff check . && uv run mypy app/ && uv run pytest -q
git add app/domains/visit/adapter/inbound/socket/server.py \
        docs/socket-contract.md tests/test_socket_payload.py
git commit -m "feat(socket): new_message에 kind·schedule·photo를 싣는다

새 이벤트를 만들지 않는다. 갈래가 둘이면 화면이 순서를 스스로 맞춰야 하고, 그
자리에서 카드가 엉뚱한 데 끼어든다.

사진의 저장소 경로는 안 내보낸다 — 화면은 messageId로 받는다. 서명 URL을
페이로드에 실으면 만료를 관리할 수 없고 로그에도 남는다.

REST가 방송할 수 있게 app.state.sio를 내준다. 상태를 바꾸는 것은 REST이고
소켓은 알리기만 한다."
```

---

## Task 6: 동기 핸들러에서 소켓으로 알리기

**Files:**
- Create: `Majung-Backend/app/domains/visit/adapter/inbound/socket/notify.py`
- Modify: `Majung-Backend/app/main.py`
- Test: `Majung-Backend/tests/test_socket_notify.py` (신규)

**Interfaces:**
- Consumes: `app.state.sio` (Task 5)
- Produces: `notify(app_state: Any, room: str, event: str, payload: dict) -> None` — 실패해도 예외를 밖으로 내지 않는다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`Majung-Backend/tests/test_socket_notify.py`

```python
"""REST 핸들러에서 소켓 방에 알린다 (2026-08-26 결정 I-1).

**알림이 실패해도 요청은 성공이다.** 상태는 이미 DB에 바뀌었고, 소켓은 빠르게 하는
장치이지 정확성의 근거가 아니다 — 놓쳐도 화면이 채팅을 닫을 때 다시 읽는다.
"""

from types import SimpleNamespace

from app.domains.visit.adapter.inbound.socket.notify import notify


class _Sio:
    def __init__(self) -> None:
        self.sent: list[tuple[str, dict[str, object], str]] = []

    async def emit(self, event: str, payload: dict[str, object], room: str) -> None:
        self.sent.append((event, payload, room))


def test_nothing_happens_without_a_socket() -> None:
    """저장이 꺼진 로컬·데모에서는 소켓이 없다. 그래도 요청이 죽으면 안 된다."""
    notify(SimpleNamespace(), "visit:1", "visit_updated", {"a": 1})


def test_nothing_happens_without_a_loop() -> None:
    """이벤트 루프를 아직 못 잡았을 때다. 조용히 넘어간다."""
    notify(SimpleNamespace(sio=_Sio()), "visit:1", "visit_updated", {"a": 1})


def test_a_broken_socket_does_not_raise() -> None:
    """**요청을 죽이지 않는다.** 로그만 남기고 넘어간다."""

    class _Broken:
        async def emit(self, *_: object, **__: object) -> None:
            raise RuntimeError("끊김")

    notify(SimpleNamespace(sio=_Broken(), loop=None), "visit:1", "x", {})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `uv run pytest tests/test_socket_notify.py -q`
Expected: FAIL — `ModuleNotFoundError: ...socket.notify`

- [ ] **Step 3: 최소 구현**

`app/domains/visit/adapter/inbound/socket/notify.py`

```python
"""REST 핸들러에서 소켓 방에 알린다 (2026-08-26 결정 I-1).

**상태를 바꾸는 것은 REST다.** 소켓으로 상태를 바꾸면 규칙이 두 곳에 생기고, 그것이
이 프로젝트에서 되풀이된 결함의 모양이다. 여기서는 "바뀌었다"만 흘려보낸다.

**요청 핸들러는 동기(`def`)다.** supabase-py가 동기라 스레드풀에서 도는데, 소켓
`emit`은 코루틴이다. 그래서 시작할 때 잡아 둔 이벤트 루프에 얹는다.
"""

import asyncio
import logging
from typing import Any

logger = logging.getLogger("majung.visit")


def notify(app_state: Any, room: str, event: str, payload: dict[str, Any]) -> None:
    """방에 한 줄 흘려보낸다. **실패해도 예외를 밖으로 내지 않는다.**

    상태는 이미 DB에 바뀌었다. 알림을 못 보냈다고 요청을 실패로 되돌리면, 실제로는
    바뀐 것이 안 바뀐 것처럼 보인다. 놓쳐도 화면이 채팅을 닫을 때 다시 읽는다.
    """
    sio = getattr(app_state, "sio", None)
    loop = getattr(app_state, "loop", None)
    if sio is None or loop is None:
        return
    try:
        asyncio.run_coroutine_threadsafe(sio.emit(event, payload, room=room), loop)
    except Exception:
        # 페이로드를 로그에 담지 않는다 — 대화 내용이 흘러간다.
        logger.warning("소켓 알림에 실패했다 — event=%s", event)
```

- [ ] **Step 4: 시작할 때 루프를 잡는다**

`app/main.py`의 `create_app()` 안, `app = FastAPI(...)` 아래에 더한다.

```python
    @app.on_event("startup")
    async def _capture_loop() -> None:
        """소켓 알림이 얹힐 이벤트 루프. **요청 핸들러가 동기라 직접 await할 수 없다.**"""
        app.state.loop = asyncio.get_running_loop()
```

파일 위쪽에 `import asyncio`를 더한다.

- [ ] **Step 5: 통과를 확인한다**

Run: `uv run pytest tests/test_socket_notify.py -q`
Expected: PASS (3 passed)

- [ ] **Step 6: 검사와 커밋**

```bash
uv run ruff check . && uv run mypy app/ && uv run pytest -q
git add app/domains/visit/adapter/inbound/socket/notify.py app/main.py \
        tests/test_socket_notify.py
git commit -m "feat(socket): REST 핸들러가 방에 알릴 수 있게 한다

요청 핸들러는 동기다(supabase-py가 동기라 스레드풀에서 돈다). 소켓 emit은
코루틴이라 시작할 때 잡아 둔 이벤트 루프에 얹는다.

실패해도 예외를 밖으로 내지 않는다. 상태는 이미 DB에 바뀌었고, 알림을 못 보냈다고
요청을 실패로 되돌리면 실제로는 바뀐 것이 안 바뀐 것처럼 보인다."
```

---

## Task 7: 제안할 때 장소를 검증한다

**Files:**
- Modify: `Majung-Backend/app/domains/visit/application/usecase.py`
- Test: `Majung-Backend/tests/test_visit_propose.py` (신규)

**Interfaces:**
- Consumes: `VisitStatus`·`VisitError`·`can_move`
- Produces: `VisitUseCase.act(...)`가 제안 시 장소와 시각을 검증한다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`Majung-Backend/tests/test_visit_propose.py`

```python
"""담당자가 만날 때를 제안한다 (2026-08-26 결정 I-1).

**실패를 수락하는 쪽으로 미루지 않는다.** 제안을 수락하면 곧바로 확정이 되므로,
그 시점에 장소가 없으면 수락 자체가 실패한다. 제안할 때 막는다.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.domains.visit.application.usecase import VisitError, VisitUseCase
from app.domains.visit.domain.entity import OrgKind, VisitRequest, VisitStatus

NOW = datetime(2026, 8, 26, 5, 0, tzinfo=UTC)
LATER = NOW + timedelta(days=2)
EARLIER = NOW - timedelta(days=2)
STAFF = uuid4()


class _Visits:
    def __init__(self, current: VisitRequest) -> None:
        self.current = current
        self.updated: dict[str, object] = {}

    def by_id(self, request_id: object) -> VisitRequest:
        return self.current

    def update_status(self, request_id: object, status: VisitStatus, **kw: object) -> None:
        self.updated = {"status": status, **kw}


def _request(status: VisitStatus, place: str = "") -> VisitRequest:
    return VisitRequest(
        id=uuid4(),
        user_id=uuid4(),
        route_id="R1",
        org_kind=OrgKind.KOREHA,
        status=status,
        preferred_at_1=LATER,
        meeting_place=place,
    )


def _staff() -> object:
    return type("S", (), {"id": STAFF, "org_kind": OrgKind.KOREHA, "name": "최다은"})()


def test_proposing_without_a_place_is_refused() -> None:
    visits = _Visits(_request(VisitStatus.ACKNOWLEDGED))
    usecase = VisitUseCase(visits=visits)  # type: ignore[arg-type]
    with pytest.raises(VisitError) as raised:
        usecase.act(
            _staff(),
            visits.current.id,
            VisitStatus.RESCHEDULE_PROPOSED,
            proposed_at=LATER,
            now=NOW,
        )
    assert raised.value.code == "no_place"


def test_proposing_with_a_place_is_kept() -> None:
    visits = _Visits(_request(VisitStatus.ACKNOWLEDGED))
    usecase = VisitUseCase(visits=visits)  # type: ignore[arg-type]
    usecase.act(
        _staff(),
        visits.current.id,
        VisitStatus.RESCHEDULE_PROPOSED,
        meeting_place="2층 상담실",
        proposed_at=LATER,
        now=NOW,
    )
    assert visits.updated["meeting_place"] == "2층 상담실"


def test_an_existing_place_is_enough() -> None:
    """한 번 확정한 적이 있으면 그때 적은 장소를 그대로 쓴다."""
    visits = _Visits(_request(VisitStatus.CONFIRMED, place="2층 상담실"))
    usecase = VisitUseCase(visits=visits)  # type: ignore[arg-type]
    usecase.act(
        _staff(),
        visits.current.id,
        VisitStatus.RESCHEDULE_PROPOSED,
        proposed_at=LATER,
        now=NOW,
    )
    assert visits.updated["status"] is VisitStatus.RESCHEDULE_PROPOSED


def test_a_past_time_is_refused() -> None:
    """이미 지난 때로 확정되면 아무도 안 나타난다."""
    visits = _Visits(_request(VisitStatus.CONFIRMED, place="2층 상담실"))
    usecase = VisitUseCase(visits=visits)  # type: ignore[arg-type]
    with pytest.raises(VisitError) as raised:
        usecase.act(
            _staff(),
            visits.current.id,
            VisitStatus.RESCHEDULE_PROPOSED,
            proposed_at=EARLIER,
            now=NOW,
        )
    assert raised.value.code == "past_time"
```

- [ ] **Step 2: 실패를 확인한다**

Run: `uv run pytest tests/test_visit_propose.py -q`
Expected: FAIL — `no_place`가 안 나고 그냥 통과하거나 다른 예외가 난다

- [ ] **Step 3: 검증을 더한다**

`app/domains/visit/application/usecase.py`의 `act` 안, 기존
`if target == VisitStatus.RESCHEDULE_PROPOSED and proposed_at is None:` 앞에 넣는다.

```python
        if target == VisitStatus.RESCHEDULE_PROPOSED:
            # **지난 때로 확정되면 아무도 안 나타난다.**
            if proposed_at is not None and proposed_at <= now:
                raise VisitError("past_time", "이미 지난 시간이에요. 다시 골라 주세요.")
            # **실패를 수락하는 쪽으로 미루지 않는다.** 제안을 수락하면 곧바로 확정이
            # 되는데, 그 시점에 장소가 없으면 수락 자체가 실패한다 (§7.1).
            if not (meeting_place.strip() or current.meeting_place.strip()):
                raise VisitError("no_place", "어디로 오면 되는지 함께 알려 주세요.")
```

`update_status` 호출의 `meeting_place`를 고쳐 **있던 값을 지우지 않게** 한다.

```python
            meeting_place=meeting_place.strip() or current.meeting_place or None,
```

`_STATUS` 표에 `"past_time": 400`을 더한다.

- [ ] **Step 4: 통과를 확인한다**

Run: `uv run pytest tests/test_visit_propose.py -q`
Expected: PASS (4 passed)

- [ ] **Step 5: 검사와 커밋**

```bash
uv run ruff check . && uv run mypy app/ && uv run pytest -q
git add app/domains/visit/application/usecase.py tests/test_visit_propose.py
git commit -m "feat(visit): 제안할 때 장소와 시각을 검증한다

실패를 수락하는 쪽으로 미루지 않는다. 제안을 수락하면 곧바로 확정이 되는데,
그 시점에 장소가 없으면 수락 자체가 실패한다.

지난 때로 확정되면 아무도 안 나타나므로 그것도 막는다."
```

---

## Task 8: 출소자가 수락한다

**Files:**
- Modify: `Majung-Backend/app/domains/visit/application/usecase.py`
- Modify: `Majung-Backend/app/domains/visit/adapter/inbound/api/router.py`
- Test: `Majung-Backend/tests/test_visit_accept.py` (신규)

**Interfaces:**
- Consumes: `VisitUseCase`, `VisitError` (Task 7)
- Produces: `VisitUseCase.accept(user_id: UUID, request_id: UUID, now: datetime) -> VisitRequest`, `POST /api/visits/{id}/accept`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`Majung-Backend/tests/test_visit_accept.py`

```python
"""출소자가 제안을 수락한다 (2026-08-26 결정 I-1).

**핵심 결함이 여기 있었다.** 상태 기계에 `제안됨 → 확정` 전이가 있는데 그 전이를
부를 수 있는 것이 담당자 창구뿐이라, 출소자는 제안을 보기만 했다.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.domains.visit.application.usecase import VisitError, VisitUseCase
from app.domains.visit.domain.entity import OrgKind, VisitRequest, VisitStatus

NOW = datetime(2026, 8, 26, 5, 0, tzinfo=UTC)
LATER = NOW + timedelta(days=2)
USER = uuid4()
STAFF = uuid4()


class _Visits:
    def __init__(self, current: VisitRequest) -> None:
        self.current = current
        self.updated: dict[str, object] = {}

    def by_id(self, request_id: object) -> VisitRequest | None:
        return self.current

    def update_status(self, request_id: object, status: VisitStatus, **kw: object) -> None:
        self.updated = {"status": status, **kw}


def _request(
    status: VisitStatus = VisitStatus.RESCHEDULE_PROPOSED,
    *,
    user_id: object = None,
    place: str = "2층 상담실",
    proposed_at: object = LATER,
) -> VisitRequest:
    return VisitRequest(
        id=uuid4(),
        user_id=user_id or USER,
        route_id="R1",
        org_kind=OrgKind.KOREHA,
        status=status,
        preferred_at_1=LATER,
        meeting_place=place,
        proposed_at=proposed_at,  # type: ignore[arg-type]
        assigned_staff_id=STAFF,
        assigned_staff_name="최다은",
    )


def _usecase(current: VisitRequest) -> tuple[VisitUseCase, _Visits]:
    visits = _Visits(current)
    return VisitUseCase(visits=visits), visits  # type: ignore[arg-type]


def test_accepting_confirms_the_proposed_time() -> None:
    usecase, visits = _usecase(_request())
    usecase.accept(USER, visits.current.id, NOW)
    assert visits.updated["status"] is VisitStatus.CONFIRMED
    assert visits.updated["confirmed_for"] == LATER


def test_the_place_is_not_wiped() -> None:
    """**조용히 지워지던 자리다.** update_status가 확정 때 장소를 무조건 덮어써서,
    수락하며 안 넘기면 "누구를 어디서 만나는지"가 사라진다. 오류도 안 난다."""
    usecase, visits = _usecase(_request())
    usecase.accept(USER, visits.current.id, NOW)
    assert visits.updated["meeting_place"] == "2층 상담실"


def test_the_staff_is_not_wiped() -> None:
    usecase, visits = _usecase(_request())
    usecase.accept(USER, visits.current.id, NOW)
    assert visits.updated["staff_id"] == STAFF


def test_someone_elses_request_is_not_found() -> None:
    """없는 요청과 같은 문구를 쓴다 — 구분해 주면 남의 id를 찾는 데 쓰인다."""
    usecase, visits = _usecase(_request(user_id=uuid4()))
    with pytest.raises(VisitError) as raised:
        usecase.accept(USER, visits.current.id, NOW)
    assert raised.value.code == "not_found"


def test_accepting_before_a_proposal_is_refused() -> None:
    usecase, visits = _usecase(_request(VisitStatus.ACKNOWLEDGED))
    with pytest.raises(VisitError) as raised:
        usecase.accept(USER, visits.current.id, NOW)
    assert raised.value.code == "bad_transition"


def test_accepting_a_cancelled_request_is_refused() -> None:
    usecase, visits = _usecase(_request(VisitStatus.CANCELLED))
    with pytest.raises(VisitError) as raised:
        usecase.accept(USER, visits.current.id, NOW)
    assert raised.value.code == "bad_transition"


def test_accepting_without_a_time_is_refused() -> None:
    usecase, visits = _usecase(_request(proposed_at=None))
    with pytest.raises(VisitError) as raised:
        usecase.accept(USER, visits.current.id, NOW)
    assert raised.value.code == "no_time"
```

- [ ] **Step 2: 실패를 확인한다**

Run: `uv run pytest tests/test_visit_accept.py -q`
Expected: FAIL — `AttributeError: 'VisitUseCase' object has no attribute 'accept'`

- [ ] **Step 3: 유스케이스를 더한다**

`app/domains/visit/application/usecase.py`의 `cancel` 아래에 더한다.

```python
    def accept(
        self, user_id: UUID, request_id: UUID, now: datetime
    ) -> VisitRequest:
        """출소자가 담당자의 제안을 수락한다 (2026-08-26 결정 I-1).

        **몸통이 없다.** 화면이 시각을 보내게 하면 옛 제안을 들고 있다가 이미 바뀐
        시각으로 확정할 수 있다. 서버가 아는 것만 쓴다.
        """
        current = self.visits.by_id(request_id)
        if current is None or current.user_id != user_id:
            # 남의 요청인지 없는 요청인지 구분해 주지 않는다.
            raise VisitError("not_found", "요청을 찾을 수 없어요.")
        if not can_move(current.status, VisitStatus.CONFIRMED):
            raise VisitError("bad_transition", "지금은 수락할 수 없어요.")
        if current.proposed_at is None:
            raise VisitError("no_time", "제안된 시간이 없어요.")

        # **있던 값을 그대로 다시 넣는다.** `update_status`는 확정할 때 담당자와
        # 장소를 넘어온 값으로 무조건 덮어쓴다(일부러 그렇게 두었다 — "확정에는
        # 담당자와 장소가 반드시 함께 간다"). 여기서 안 채우면 수락하는 순간
        # 둘 다 None이 되고, 화면에는 "확정되었어요"만 남는다. 오류도 안 난다.
        self.visits.update_status(
            request_id,
            VisitStatus.CONFIRMED,
            staff_id=current.assigned_staff_id,
            meeting_place=current.meeting_place,
            confirmed_for=current.proposed_at,
            now=now,
        )
        updated = self.visits.by_id(request_id)
        assert updated is not None
        return updated
```

- [ ] **Step 4: 창구를 낸다**

`app/domains/visit/adapter/inbound/api/router.py`의 `cancel_visit` 아래에 더한다.

```python
@router.post("/visits/{request_id}/accept", response_model=VisitOut)
def accept_visit(
    request_id: UUID, request: Request, account: CurrentAccount
) -> VisitOut:
    """담당자가 제안한 때를 받아들인다 (§7.2 · 결정 I-1).

    **몸통이 없다.** 화면이 시각을 보내면 옛 제안을 들고 있다가 이미 바뀐 시각으로
    확정할 수 있다. 서버가 아는 `proposed_at`으로 확정한다.
    """
    try:
        updated = _usecase(request).accept(account.id, request_id, utcnow())
    except VisitError as err:
        raise _fail(err) from None
    return _to_out(updated, _glance(_chat(request), updated, SenderRole.USER))
```

`utcnow`가 없으면 `from app.domains.account.domain.tokens import utcnow`를 더한다.

- [ ] **Step 5: 통과를 확인한다**

Run: `uv run pytest tests/test_visit_accept.py -q`
Expected: PASS (7 passed)

- [ ] **Step 6: CORS 검사를 확인한다**

Run: `uv run pytest tests/test_cors_methods.py -q`
Expected: PASS — `POST`는 이미 허용 목록에 있다. 이 검사가 새 창구의 메서드를 센다.

- [ ] **Step 7: 검사와 커밋**

```bash
uv run ruff check . && uv run mypy app/ && uv run pytest -q
git add app/domains/visit/application/usecase.py \
        app/domains/visit/adapter/inbound/api/router.py tests/test_visit_accept.py
git commit -m "feat(visit): 출소자가 제안을 수락할 수 있게 한다

핵심 결함이 여기 있었다. 상태 기계에 제안됨 → 확정 전이가 있는데 그 전이를 부를 수
있는 것이 담당자 창구뿐이라, 출소자는 제안을 보기만 했다.

몸통이 없다 — 화면이 시각을 보내면 옛 제안으로 확정할 수 있다.

**있던 담당자와 장소를 그대로 다시 넣는다.** update_status는 확정할 때 그 둘을
무조건 덮어쓰므로, 안 채우면 수락하는 순간 '누구를 어디서 만나는지'가 사라진다."
```

---

## Task 9: 약속 카드를 대화에 쌓는다

**Files:**
- Modify: `Majung-Backend/app/domains/visit/adapter/inbound/api/router.py`
- Test: `Majung-Backend/tests/test_schedule_message.py` (신규)

**Interfaces:**
- Consumes: `MessageKind`·`Schedule` (Task 2), `notify` (Task 6), `_payload` (Task 5)
- Produces: `_leave_card(request, visit, kind, actor)` — 상태를 바꾼 뒤 카드를 남기고 방송한다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`Majung-Backend/tests/test_schedule_message.py`

```python
"""약속 카드를 대화에 남긴다 (2026-08-26 결정 I-1).

**상태를 먼저 바꾸고 카드를 뒤에 넣는다.** 반대로 하면 약속했다고 적혀 있는데
실제로는 아닌 대화가 남는다.
"""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

from app.domains.visit.adapter.inbound.api.router import _leave_card
from app.domains.visit.domain.entity import OrgKind, VisitRequest, VisitStatus
from app.domains.visit.domain.message import MessageKind, SenderRole

NOW = datetime(2026, 8, 26, 5, 0, tzinfo=UTC)
LATER = NOW + timedelta(days=2)


class _Messages:
    def __init__(self) -> None:
        self.added: list[dict[str, object]] = []

    def add(self, **kw: object) -> tuple[object, bool]:
        self.added.append(kw)
        return SimpleNamespace(
            id=uuid4(),
            visit_id=kw["visit_id"],
            sender_role=kw["sender_role"],
            body="",
            created_at=NOW,
            client_msg_id="",
            kind=kw.get("kind", MessageKind.TEXT),
            schedule=kw.get("schedule"),
            photo=None,
        ), True


def _request(messages: _Messages | None) -> SimpleNamespace:
    return SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(visit_message_repo=messages))
    )


def _visit(status: VisitStatus, **over: object) -> VisitRequest:
    base = {
        "id": uuid4(),
        "user_id": uuid4(),
        "route_id": "R1",
        "org_kind": OrgKind.KOREHA,
        "status": status,
        "preferred_at_1": LATER,
        "meeting_place": "2층 상담실",
        "assigned_staff_name": "최다은",
        "proposed_at": LATER,
    }
    base.update(over)
    return VisitRequest(**base)  # type: ignore[arg-type]


def test_a_proposal_leaves_a_card() -> None:
    messages = _Messages()
    _leave_card(
        _request(messages),
        _visit(VisitStatus.RESCHEDULE_PROPOSED),
        MessageKind.PROPOSED,
        SenderRole.STAFF,
    )
    assert messages.added[0]["kind"] is MessageKind.PROPOSED
    schedule = messages.added[0]["schedule"]
    assert schedule is not None and schedule.at == LATER


def test_a_confirmation_card_uses_the_confirmed_time() -> None:
    """확정 카드에는 확정된 때가 적힌다. 제안된 때가 아니다."""
    messages = _Messages()
    settled = NOW + timedelta(days=3)
    _leave_card(
        _request(messages),
        _visit(VisitStatus.CONFIRMED, confirmed_for=settled),
        MessageKind.CONFIRMED,
        SenderRole.USER,
    )
    schedule = messages.added[0]["schedule"]
    assert schedule is not None and schedule.at == settled


def test_a_card_has_no_body() -> None:
    messages = _Messages()
    _leave_card(
        _request(messages),
        _visit(VisitStatus.CANCELLED),
        MessageKind.CANCELLED,
        SenderRole.STAFF,
    )
    assert messages.added[0]["body"] == ""


def test_without_a_repository_nothing_breaks() -> None:
    """저장이 꺼진 로컬·데모다. 상태는 이미 바뀌었고 카드만 빠진다."""
    _leave_card(
        _request(None),
        _visit(VisitStatus.RESCHEDULE_PROPOSED),
        MessageKind.PROPOSED,
        SenderRole.STAFF,
    )


def test_a_failing_repository_does_not_raise() -> None:
    """**카드 저장이 실패해도 요청은 성공이다.** 상태는 이미 바뀌었고, 알림과 요청
    화면은 맞다. 대화에 카드가 빠질 뿐이다."""

    class _Broken:
        def add(self, **_: object) -> tuple[object, bool]:
            raise RuntimeError("저장 실패")

    _leave_card(
        _request(_Broken()),  # type: ignore[arg-type]
        _visit(VisitStatus.RESCHEDULE_PROPOSED),
        MessageKind.PROPOSED,
        SenderRole.STAFF,
    )
```

- [ ] **Step 2: 실패를 확인한다**

Run: `uv run pytest tests/test_schedule_message.py -q`
Expected: FAIL — `ImportError: cannot import name '_leave_card'`

- [ ] **Step 3: 최소 구현**

`app/domains/visit/adapter/inbound/api/router.py`에 더한다.

```python
def _card_time(visit: VisitRequest, kind: MessageKind) -> datetime | None:
    """카드에 적을 때. **확정 카드에는 확정된 때가 적힌다** — 제안된 때가 아니다."""
    if kind is MessageKind.CONFIRMED:
        return visit.confirmed_for
    return visit.proposed_at or visit.confirmed_for


def _leave_card(
    request: Request, visit: VisitRequest, kind: MessageKind, actor: SenderRole
) -> None:
    """약속 카드를 대화에 남기고 방에 알린다 (결정 I-1).

    **상태를 먼저 바꾸고 여기를 부른다.** 반대로 하면 약속했다고 적혀 있는데 실제로는
    아닌 대화가 남는다.

    **실패해도 예외를 밖으로 내지 않는다.** 상태는 이미 바뀌었고 알림과 요청 화면은
    맞다. 대화에 카드가 빠질 뿐이다.
    """
    messages = getattr(request.app.state, "visit_message_repo", None)
    if messages is None:
        return
    at = _card_time(visit, kind)
    if at is None:
        return
    try:
        saved, _ = messages.add(
            visit_id=visit.id,
            sender_role=actor,
            body="",
            kind=kind,
            schedule=Schedule(
                at=at,
                place=visit.meeting_place,
                staff_name=visit.assigned_staff_name,
            ),
        )
    except Exception:
        # 카드 내용을 로그에 담지 않는다.
        logger.warning("약속 카드를 남기지 못했다 — kind=%s", kind.value)
        return
    notify(request.app.state, f"visit:{visit.id}", "new_message", _payload(saved))
```

임포트에 `MessageKind`·`Schedule`·`SenderRole`·`notify`·`_payload`·`logger`를 더한다.
`logger`가 없으면 `logger = logging.getLogger("majung.visit")`를 파일 위에 둔다.

- [ ] **Step 4: 부르는 자리를 잇는다**

- 담당자 액션(`update_staff_visit`): 상태가 `RESCHEDULE_PROPOSED`면
  `_leave_card(request, updated, MessageKind.PROPOSED, SenderRole.STAFF)`,
  `CONFIRMED`면 `MessageKind.CONFIRMED`, `CANCELLED`면 `MessageKind.CANCELLED`
- `accept_visit`: `_leave_card(request, updated, MessageKind.CONFIRMED, SenderRole.USER)`
- 사용자 `cancel_visit`: `_leave_card(request, updated, MessageKind.CANCELLED, SenderRole.USER)`

각 자리에서 **`_to_out`을 만들기 전에** 부른다. 순서는 상태 변경 → 카드 → 응답이다.

- [ ] **Step 5: 통과를 확인한다**

Run: `uv run pytest tests/test_schedule_message.py -q`
Expected: PASS (5 passed)

- [ ] **Step 6: 검사와 커밋**

```bash
uv run ruff check . && uv run mypy app/ && uv run pytest -q
git add app/domains/visit/adapter/inbound/api/router.py tests/test_schedule_message.py
git commit -m "feat(visit): 제안·확정·취소를 대화에 카드로 남긴다

중고 거래 앱에서 만날 약속을 잡는 것과 같은 모양이다. 위로 올려 보면 언제 무엇을
정했는지 그대로 보인다.

상태를 먼저 바꾸고 카드를 뒤에 넣는다 — 반대로 하면 약속했다고 적혀 있는데 실제로는
아닌 대화가 남는다. 카드 저장이 실패해도 요청은 성공이다."
```

---

## Task 10: 사진 저장소

**Files:**
- Create: `Majung-Backend/app/domains/visit/infrastructure/photo_storage.py`
- Modify: `Majung-Backend/app/main.py`
- Modify: `Majung-Backend/pyproject.toml`
- Test: `Majung-Backend/tests/test_photo_storage.py` (신규)

**Interfaces:**
- Consumes: `FieldCipher.encrypt_bytes`·`decrypt_bytes` (Task 1)
- Produces: `SupabasePhotoStorage.put(path: str, data: bytes) -> None`, `.get(path: str) -> bytes`, `.remove_prefix(prefix: str) -> None`, `BUCKET = "visit-photos"`

- [ ] **Step 1: Supabase에 버킷을 만든다**

Supabase MCP `execute_sql`로 비공개 버킷을 만든다.

```sql
insert into storage.buckets (id, name, public)
values ('visit-photos', 'visit-photos', false)
on conflict (id) do nothing;
```

**정책을 두지 않는다.** 정책이 없으면 anon 키로는 아무것도 못 하고 백엔드의
service_role만 닿는다 — `visit_message`에 RLS를 켜고 정책을 안 둔 것과 같은 판단이다.

- [ ] **Step 2: 의존성을 더한다**

```bash
cd Majung-Backend && uv add python-multipart
```

`pyproject.toml`의 `dependencies`에 한 줄이 늘어야 한다. **그 밖의 것이 늘면 되돌린다.**

- [ ] **Step 3: 실패하는 테스트를 쓴다**

`Majung-Backend/tests/test_photo_storage.py`

```python
"""사진을 저장소에 넣고 꺼낸다 (2026-08-26 결정 I-3).

**저장소에는 암호문만 올라간다.** 담당자 화면은 공용 기기일 수 있고 오가는 것이
신분증이다.
"""

import os

import pytest

from app.domains.visit.infrastructure.photo_storage import (
    BUCKET,
    SupabasePhotoStorage,
)
from app.infrastructure.security.crypto import CryptoError, FieldCipher

CIPHER = FieldCipher(key=os.urandom(32))


class _Bucket:
    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}
        self.removed: list[str] = []

    def upload(self, path: str, file: bytes, file_options: dict[str, str]) -> None:
        self.files[path] = file

    def download(self, path: str) -> bytes:
        return self.files[path]

    def list(self, prefix: str) -> list[dict[str, str]]:
        return [
            {"name": p.split("/", 1)[1]}
            for p in self.files
            if p.startswith(f"{prefix}/")
        ]

    def remove(self, paths: list[str]) -> None:
        self.removed.extend(paths)
        for p in paths:
            self.files.pop(p, None)


class _Client:
    def __init__(self, bucket: _Bucket) -> None:
        self._bucket = bucket
        self.storage = self

    def from_(self, name: str) -> _Bucket:
        assert name == BUCKET
        return self._bucket


def _storage(bucket: _Bucket) -> SupabasePhotoStorage:
    return SupabasePhotoStorage(_Client(bucket), CIPHER)  # type: ignore[arg-type]


def test_roundtrip() -> None:
    bucket = _Bucket()
    photo = os.urandom(4096)
    _storage(bucket).put("v1/m1", photo)
    assert _storage(bucket).get("v1/m1") == photo


def test_only_ciphertext_is_stored() -> None:
    """**평문이 저장소에 올라가면 안 된다.** 이 검사가 그것을 지킨다."""
    bucket = _Bucket()
    photo = b"SECRET-PHOTO-BYTES" * 100
    _storage(bucket).put("v1/m1", photo)
    assert b"SECRET-PHOTO-BYTES" not in bucket.files["v1/m1"]


def test_a_tampered_file_is_refused() -> None:
    bucket = _Bucket()
    _storage(bucket).put("v1/m1", b"hello")
    broken = bytearray(bucket.files["v1/m1"])
    broken[-1] ^= 0x01
    bucket.files["v1/m1"] = bytes(broken)
    with pytest.raises(CryptoError):
        _storage(bucket).get("v1/m1")


def test_removing_a_prefix_clears_the_room() -> None:
    """**DB의 cascade는 저장소를 모른다.** 계정을 지울 때 이것을 함께 불러야 한다."""
    bucket = _Bucket()
    store = _storage(bucket)
    store.put("v1/m1", b"a")
    store.put("v1/m2", b"b")
    store.put("v2/m1", b"c")
    store.remove_prefix("v1")
    assert set(bucket.files) == {"v2/m1"}


def test_removing_an_empty_prefix_is_not_an_error() -> None:
    bucket = _Bucket()
    _storage(bucket).remove_prefix("v9")
    assert bucket.removed == []
```

- [ ] **Step 4: 실패를 확인한다**

Run: `uv run pytest tests/test_photo_storage.py -q`
Expected: FAIL — `ModuleNotFoundError: ...photo_storage`

- [ ] **Step 5: 최소 구현**

`app/domains/visit/infrastructure/photo_storage.py`

```python
"""사진 파일 저장소 (Infrastructure) — 2026-08-26 결정 I-3.

**저장소에는 암호문만 올라간다.** 담당자 화면은 공용 기기일 수 있고 오가는 것이
신분증이다. 대화 본문을 암호화하는 것과 같은 판단이다(§9.2).

경로는 `{visitId}/{messageId}`다. 방 단위로 묶여 있어 방문 요청이 지워지면 그 앞자리를
통째로 지우면 된다 — **DB의 cascade는 저장소를 모른다.**
"""

import logging

from supabase import Client

from app.infrastructure.security.crypto import FieldCipher

logger = logging.getLogger("majung.visit")

#: 비공개 버킷. 정책을 두지 않아 service_role만 닿는다.
BUCKET = "visit-photos"


class SupabasePhotoStorage:
    def __init__(self, client: Client, cipher: FieldCipher) -> None:
        self._db = client
        self._cipher = cipher

    def put(self, path: str, data: bytes) -> None:
        """암호화해서 올린다. **평문이 저장소에 닿지 않는다.**"""
        self._db.storage.from_(BUCKET).upload(
            path=path,
            file=self._cipher.encrypt_bytes(data),
            # 암호문이라 무엇이든 바이트 덩어리다. 원래 형식은 DB의 photo.mime에 있다.
            file_options={"content-type": "application/octet-stream"},
        )

    def get(self, path: str) -> bytes:
        """받아서 복호화한다. 변조되었으면 `CryptoError`를 낸다."""
        return self._cipher.decrypt_bytes(self._db.storage.from_(BUCKET).download(path))

    def remove_prefix(self, prefix: str) -> None:
        """그 방의 사진을 전부 지운다 (§9.4).

        **계정을 지울 때 이것을 함께 불러야 한다.** DB의 cascade가 `visit_message`는
        지우지만 저장소 파일은 모른다 — 안 부르면 지웠다는 말이 반쪽이 된다.
        """
        bucket = self._db.storage.from_(BUCKET)
        found = [f"{prefix}/{item['name']}" for item in bucket.list(prefix) or []]
        if found:
            bucket.remove(found)
```

- [ ] **Step 6: 통과를 확인한다**

Run: `uv run pytest tests/test_photo_storage.py -q`
Expected: PASS (5 passed)

- [ ] **Step 7: 배선한다**

`app/main.py`에서 저장이 켜졌을 때 `photo_storage`를 만든다. `message_repo`를 만드는
자리 바로 옆이다.

```python
        app.state.photo_storage = SupabasePhotoStorage(supabase, cipher)
```

`delete_me`(계정 삭제)에서 그 사용자의 방문 요청마다 `remove_prefix(str(visit.id))`를
부른다. **DB를 지우기 전에 부른다** — 지운 뒤에는 어느 방이 있었는지 알 수 없다.

- [ ] **Step 8: 검사와 커밋**

```bash
uv run ruff check . && uv run mypy app/ && uv run pytest -q
git add pyproject.toml uv.lock app/domains/visit/infrastructure/photo_storage.py \
        app/main.py tests/test_photo_storage.py
git commit -m "feat(visit): 사진을 암호화해 저장소에 넣는다

저장소에는 암호문만 올라간다. 담당자 화면은 공용 기기일 수 있고 오가는 것이
신분증이다.

**DB의 cascade는 저장소를 모른다.** 계정을 지울 때 방마다 remove_prefix를 부른다 —
안 부르면 지웠다는 말이 반쪽이 된다. DB를 지우기 전에 부른다.

새 의존성은 python-multipart 하나다."
```

---

## Task 11: 사진 창구 둘

**Files:**
- Modify: `Majung-Backend/app/domains/visit/adapter/inbound/api/router.py`
- Test: `Majung-Backend/tests/test_photo_api.py` (신규)

**Interfaces:**
- Consumes: `SupabasePhotoStorage` (Task 10), `MessageKind`·`Photo` (Task 2), `_leave_card` 패턴 (Task 9)
- Produces: `POST /api/visits/{id}/photos`, `GET /api/visits/{id}/photos/{message_id}`, `MAX_PHOTO_BYTES = 5 * 1024 * 1024`, `ALLOWED_MIME`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

받기 전 거르는 규칙은 순수 계산이라 따로 뺀다.

`Majung-Backend/tests/test_photo_api.py`

```python
"""사진을 받기 전에 거른다 (2026-08-26 결정 I-3).

**서버가 사진을 두 번 지나간다** — 올릴 때 한 번, 볼 때 한 번이다. EC2가 t4g.micro라
크기 상한이 곧 비용이다.
"""

import pytest

from app.domains.visit.adapter.inbound.api.router import (
    ALLOWED_MIME,
    MAX_PHOTO_BYTES,
    check_photo,
)


def test_a_normal_photo_passes() -> None:
    check_photo("image/jpeg", 2 * 1024 * 1024)


def test_five_megabytes_is_the_line() -> None:
    check_photo("image/jpeg", MAX_PHOTO_BYTES)


def test_a_bigger_photo_is_refused() -> None:
    """**자르지 않는다** — 잘린 사진을 보낸 사람은 다 갔다고 믿는다."""
    with pytest.raises(Exception) as raised:
        check_photo("image/jpeg", MAX_PHOTO_BYTES + 1)
    assert getattr(raised.value, "status_code", None) == 413


def test_an_empty_file_is_refused() -> None:
    with pytest.raises(Exception) as raised:
        check_photo("image/jpeg", 0)
    assert getattr(raised.value, "status_code", None) == 400


def test_heic_is_refused() -> None:
    """아이폰 기본 형식이다. "다른 형식으로 보내 주세요"라고 안내한다."""
    with pytest.raises(Exception) as raised:
        check_photo("image/heic", 1024)
    assert getattr(raised.value, "status_code", None) == 415


def test_the_allowed_list_is_what_we_declared() -> None:
    assert ALLOWED_MIME == {"image/jpeg", "image/png", "image/webp"}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `uv run pytest tests/test_photo_api.py -q`
Expected: FAIL — `ImportError: cannot import name 'check_photo'`

- [ ] **Step 3: 거르는 규칙을 더한다**

`app/domains/visit/adapter/inbound/api/router.py`

```python
#: 사진 한 장의 상한. **서버가 두 번 지나가므로 상한이 곧 비용이다** —
#: 올릴 때 한 번, 볼 때 한 번이다. 폰 사진 한 장이 보통 2~4MB다.
MAX_PHOTO_BYTES = 5 * 1024 * 1024

#: 받는 형식. 선언한 것만 받는다. HEIC(아이폰 기본)는 안 받는다.
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}


def check_photo(mime: str, size: int) -> None:
    """받기 전에 거른다. 통과하지 못하면 `HTTPException`을 낸다."""
    if mime not in ALLOWED_MIME:
        raise HTTPException(
            status_code=415, detail="사진은 JPG나 PNG로 보내 주세요."
        )
    if size <= 0:
        raise HTTPException(status_code=400, detail="사진을 고르지 않으셨어요.")
    if size > MAX_PHOTO_BYTES:
        # **자르지 않는다.** 잘린 사진을 보낸 사람은 다 갔다고 믿는다.
        raise HTTPException(
            status_code=413, detail="사진이 너무 커요. 5MB보다 작은 사진을 보내 주세요."
        )
```

- [ ] **Step 4: 창구 둘을 더한다**

```python
@router.post("/visits/{request_id}/photos", response_model=None, status_code=201)
async def upload_photo(
    request_id: UUID,
    request: Request,
    account: CurrentAccount,
    file: UploadFile = File(...),
    client_msg_id: str = Form(default=""),
) -> Response:
    """사진을 보낸다 (§7.3 · 결정 I-3).

    **저장소를 먼저 올리고 DB를 뒤에 쓴다.** 반대로 하면 대화에 줄은 있는데 사진이
    없는 상태가 생긴다. 저장소만 남으면 아무도 못 보는 파일이 쌓이므로 그때는 지운다.
    """
    chat = _chat(request)
    storage = getattr(request.app.state, "photo_storage", None)
    messages = getattr(request.app.state, "visit_message_repo", None)
    if chat is None or storage is None or messages is None:
        raise HTTPException(
            status_code=503, detail="지금은 이용할 수 없어요. 잠시 후 다시 시도해 주세요."
        )

    try:
        visit = chat.room_for_user(account.id, request_id)
    except NotInRoom:
        raise HTTPException(status_code=404, detail="요청을 찾을 수 없어요.") from None
    if not visit.chat_available:
        raise HTTPException(status_code=409, detail="이 요청은 끝나서 더 이야기할 수 없어요.")

    data = await file.read()
    check_photo(file.content_type or "", len(data))

    message_id = uuid4()
    path = f"{visit.id}/{message_id}"
    storage.put(path, data)
    try:
        saved, is_new = messages.add(
            visit_id=visit.id,
            sender_role=SenderRole.USER,
            body="",
            client_msg_id=client_msg_id,
            kind=MessageKind.PHOTO,
            photo=Photo(path=path, bytes_=len(data), mime=file.content_type or ""),
        )
    except Exception:
        # 아무도 못 보는 파일을 남기지 않는다.
        storage.remove_prefix(str(visit.id))
        raise HTTPException(status_code=500, detail="사진을 보내지 못했어요.") from None

    if is_new:
        notify(request.app.state, f"visit:{visit.id}", "new_message", _payload(saved))
    return Response(status_code=201)


@router.get("/visits/{request_id}/photos/{message_id}", response_model=None)
def read_photo(
    request_id: UUID,
    message_id: UUID,
    request: Request,
    account: CurrentAccount,
) -> Response:
    """사진을 받는다. **서명 URL을 대화에 실어 보내지 않는다** — 페이로드에 URL이
    박히면 만료를 관리할 수 없고 서버 로그에도 남는다."""
    chat = _chat(request)
    storage = getattr(request.app.state, "photo_storage", None)
    messages = getattr(request.app.state, "visit_message_repo", None)
    if chat is None or storage is None or messages is None:
        raise HTTPException(status_code=503, detail="지금은 이용할 수 없어요.")

    try:
        visit = chat.room_for_user(account.id, request_id)
    except NotInRoom:
        raise HTTPException(status_code=404, detail="요청을 찾을 수 없어요.") from None

    found = next(
        (m for m in messages.history(visit.id) if m.id == message_id and m.photo), None
    )
    if found is None or found.photo is None:
        raise HTTPException(status_code=404, detail="사진을 찾을 수 없어요.")

    try:
        data = storage.get(found.photo.path)
    except CryptoError:
        raise HTTPException(status_code=404, detail="사진을 열지 못했어요.") from None

    return Response(
        content=data,
        media_type=found.photo.mime,
        # 같은 사진을 스크롤할 때마다 서버가 다시 지나가지 않게 한다.
        headers={"Cache-Control": "private, max-age=300"},
    )
```

임포트에 `File`·`Form`·`UploadFile`·`Response`·`uuid4`·`CryptoError`·`NotInRoom`을
더한다.

- [ ] **Step 5: 통과를 확인한다**

Run: `uv run pytest tests/test_photo_api.py tests/test_cors_methods.py -q`
Expected: PASS — 새 창구가 `POST`·`GET`이라 CORS 목록에 이미 있다

- [ ] **Step 6: 검사와 커밋**

```bash
uv run ruff check . && uv run mypy app/ && uv run pytest -q
git add app/domains/visit/adapter/inbound/api/router.py tests/test_photo_api.py
git commit -m "feat(visit): 사진을 주고받는 창구 둘

저장소를 먼저 올리고 DB를 뒤에 쓴다. 반대로 하면 대화에 줄은 있는데 사진이 없다.
저장소만 남으면 아무도 못 보는 파일이 쌓이므로 그때는 지운다.

서명 URL을 대화에 실어 보내지 않는다 — 페이로드에 URL이 박히면 만료를 관리할 수
없고 서버 로그에도 남는다. 화면은 messageId로 받는다.

5MB를 넘으면 자르지 않고 거절한다. 잘린 사진을 보낸 사람은 다 갔다고 믿는다."
```

---

## Task 12: 화면 — 새 계약을 받는다

**Files:**
- Create: `Majung-Frontend/src/features/visit/domain/message.ts`
- Modify: `Majung-Frontend/src/features/visit/hooks/useVisitChat.ts`
- Test: `Majung-Frontend/src/features/visit/domain/message.test.ts` (신규)

**Interfaces:**
- Produces: `ChatKind`, `ChatSchedule`, `ChatPhoto`, `ChatEntry`, `answerableCardId(entries, status)`
- Consumes: 소켓 `new_message`의 `kind`·`schedule`·`photo` (Task 5)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`Majung-Frontend/src/features/visit/domain/message.test.ts`

```ts
// **전역이 아니라 가져와서 쓴다.** `expo/tsconfig.base`가 `types`를 좁혀 두어
// `describe`·`it`·`expect`가 전역으로 잡히지 않는다.
import { describe, expect, it } from "@jest/globals";

import { answerableCardId, type ChatEntry } from "./message";

const entry = (over: Partial<ChatEntry> & { id: string }): ChatEntry => ({
  from: "staff",
  text: "",
  kind: "proposed",
  at: "2026-08-26T05:00:00Z",
  ...over,
});

describe("answerableCardId — 버튼을 그릴 카드", () => {
  it("마지막 제안에만 버튼이 붙는다", () => {
    const entries = [
      entry({ id: "a", at: "2026-08-26T05:00:00Z" }),
      entry({ id: "b", at: "2026-08-26T06:00:00Z" }),
    ];
    expect(answerableCardId(entries, "reschedule_proposed")).toBe("b");
  });

  it("확정된 뒤에는 아무 카드에도 버튼이 없다", () => {
    // 수락하고 나면 두 번 수락할 일이 없다.
    const entries = [entry({ id: "a" }), entry({ id: "b", kind: "confirmed" })];
    expect(answerableCardId(entries, "confirmed")).toBeNull();
  });

  it("취소된 뒤에도 버튼이 없다", () => {
    expect(answerableCardId([entry({ id: "a" })], "cancelled")).toBeNull();
  });

  it("사람이 쓴 말에는 버튼이 붙지 않는다", () => {
    const entries = [entry({ id: "a", kind: "text", text: "안녕하세요" })];
    expect(answerableCardId(entries, "reschedule_proposed")).toBeNull();
  });

  it("시각으로 마지막을 고른다", () => {
    // **서버가 시간순으로 준다는 것에 기대지 않는다.** 어긋나면 엉뚱한 카드에
    // 버튼이 붙는데, 화면에서는 그것이 틀린 줄 알 수 없다.
    const entries = [
      entry({ id: "늦은것", at: "2026-08-26T09:00:00Z" }),
      entry({ id: "이른것", at: "2026-08-26T01:00:00Z" }),
    ];
    expect(answerableCardId(entries, "reschedule_proposed")).toBe("늦은것");
  });

  it("아무것도 없으면 없다고 한다", () => {
    expect(answerableCardId([], "reschedule_proposed")).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd Majung-Frontend && npx jest src/features/visit/domain/message.test.ts`
Expected: FAIL — `Cannot find module './message'`

- [ ] **Step 3: 최소 구현**

`Majung-Frontend/src/features/visit/domain/message.ts`

```ts
// 담당자 채팅의 한 줄 (§7.3 · 2026-08-26 결정 I-1·I-3).
//
// **약속 카드와 사진도 대화의 한 줄이다.** 따로 관리하는 목록으로 두면 순서를 화면이
// 스스로 맞춰야 하고, 그 자리에서 카드가 엉뚱한 데 끼어든다.
//
// 이 파일은 계산만 한다. 화면도 서버 호출도 없다.
import type { VisitStatus } from "@/shared/types/visit";

/** 대화 한 줄의 종류. **모르는 값은 사람이 쓴 말로 본다** — 서버가 앞서 나가도 안 깨진다. */
export type ChatKind = "text" | "proposed" | "confirmed" | "cancelled" | "photo";

export type ChatSchedule = {
  /** ISO 8601. */
  at: string;
  place: string;
  staffName: string;
};

export type ChatPhoto = {
  bytes: number;
  mime: string;
};

export type ChatEntry = {
  id: string;
  from: "user" | "staff";
  text: string;
  kind: ChatKind;
  /** 온 시각(ISO). 서버가 준다. */
  at: string;
  schedule?: ChatSchedule | null;
  photo?: ChatPhoto | null;
};

/**
 * 지금 답할 수 있는 제안 카드의 id. 없으면 `null`.
 *
 * **버튼을 저장하지 않는다.** 카드에 "답했음"을 넣으면 상태와 어긋날 수 있고,
 * 어긋나면 지난 카드의 버튼이 다시 살아난다.
 *
 * **시각으로 마지막을 고른다.** 서버가 시간순으로 준다는 것에 기대지 않는다 — 그
 * 약속이 한 번 어긋나면 엉뚱한 카드에 버튼이 붙고, 화면에서는 틀린 줄 알 수 없다.
 */
export function answerableCardId(
  entries: readonly ChatEntry[],
  status: VisitStatus,
): string | null {
  if (status !== "reschedule_proposed") return null;
  const proposals = entries.filter((e) => e.kind === "proposed");
  if (proposals.length === 0) return null;
  return proposals.reduce((last, e) => (e.at > last.at ? e : last)).id;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx jest src/features/visit/domain/message.test.ts`
Expected: PASS (6 passed)

- [ ] **Step 5: 훅이 새 필드를 받게 한다**

`src/features/visit/hooks/useVisitChat.ts`의 `ServerMessage`에 필드를 더한다.

```ts
  kind?: ChatKind;
  schedule?: ChatSchedule | null;
  photo?: ChatPhoto | null;
```

`toMessage`를 고친다.

```ts
function toMessage(m: ServerMessage): ChatEntry {
  return {
    id: m.id,
    from: m.senderRole,
    text: m.body,
    // **모르는 종류는 사람이 쓴 말로 본다.** 서버가 앞서 나가도 대화가 안 깨진다.
    kind: KNOWN_KINDS.has(m.kind ?? "text") ? (m.kind as ChatKind) : "text",
    at: m.createdAt,
    schedule: m.schedule ?? null,
    photo: m.photo ?? null,
  };
}

const KNOWN_KINDS = new Set<string>([
  "text",
  "proposed",
  "confirmed",
  "cancelled",
  "photo",
]);
```

낙관적 말풍선도 `kind: "text"`와 `at: new Date().toISOString()`을 갖게 한다.

- [ ] **Step 6: 검사와 커밋**

```bash
npx tsc --noEmit && npx eslint src && npx jest
git add src/features/visit/domain/message.ts \
        src/features/visit/domain/message.test.ts \
        src/features/visit/hooks/useVisitChat.ts
git commit -m "feat(chat): 화면이 약속 카드와 사진을 받는다

모르는 종류는 사람이 쓴 말로 본다 — 서버가 앞서 나가도 대화가 안 깨진다.

버튼을 저장하지 않는다. 마지막 제안이고 요청이 그 제안을 기다릴 때만 그린다.
시각으로 마지막을 고른다 — 서버가 시간순으로 준다는 것에 기대지 않는다."
```

---

## Task 13: 화면 — 약속 카드와 제안 시트

**Files:**
- Create: `Majung-Frontend/src/features/visit/views/ScheduleCard.tsx`
- Create: `Majung-Frontend/src/features/visit/views/ProposeSheet.tsx`
- Modify: `Majung-Frontend/src/features/visit/views/StaffChatScreen.tsx`
- Modify: `Majung-Frontend/src/shared/utils/api.ts`

**Interfaces:**
- Consumes: `ChatEntry`·`answerableCardId` (Task 12), `VisitTimeField`·`fromIso`·`toIso` (`@/shared/components/VisitTimeField`, `@/shared/utils/visitTime`)
- Produces: `acceptVisit(token: string, visitId: string): Promise<VisitResponse>`, `ScheduleCard`, `ProposeSheet`

- [ ] **Step 1: 창구를 잇는다**

`src/shared/utils/api.ts`

```ts
/**
 * POST /api/visits/{id}/accept — 담당자가 제안한 때를 받아들인다 (§7.2).
 *
 * **몸통이 없다.** 화면이 시각을 보내면 옛 제안을 들고 있다가 이미 바뀐 시각으로
 * 확정할 수 있다. 서버가 아는 것으로 확정한다.
 */
export async function acceptVisit(token: string, visitId: string): Promise<VisitResponse> {
  const res = await fetch(`${API_BASE}/api/visits/${encodeURIComponent(visitId)}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as VisitResponse;
}
```

- [ ] **Step 2: 약속 카드를 만든다**

`src/features/visit/views/ScheduleCard.tsx`

```tsx
// 대화에 서는 약속 카드 (§7.2 · 2026-08-26 결정 I-1).
//
// **좌우 어느 쪽에도 붙지 않고 가운데에 선다.** 누가 보낸 말이 아니라 둘 사이에
// 정해진 일이기 때문이다.
import { Pressable, Text, View } from "react-native";

import { Icon } from "@/shared/components/Icon";
import { COLORS } from "@/shared/theme/colors";
import { fromIso, timeLabel } from "@/shared/utils/visitTime";

import type { ChatEntry } from "../domain/message";

const TITLE: Record<string, string> = {
  proposed: "만날 때를 제안했어요",
  confirmed: "만남이 예약되었어요",
  cancelled: "약속이 취소되었어요",
};

export function ScheduleCard({
  entry,
  answerable,
  onAccept,
  onDecline,
}: {
  entry: ChatEntry;
  /** 지금 답할 수 있는 카드인가. 지난 제안에는 버튼이 없다. */
  answerable: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const settled = entry.kind === "confirmed";
  const gone = entry.kind === "cancelled";
  const when = entry.schedule ? timeLabel(fromIso(entry.schedule.at)) : "";

  return (
    <View className="my-3 items-center">
      <View
        className="w-[86%] rounded-2xl border-[1.5px] px-4 py-4"
        style={{
          backgroundColor: gone ? COLORS.alertSoft : COLORS.surface,
          borderColor: gone ? COLORS.alertLine : settled ? COLORS.doneLine : COLORS.brandSoft,
        }}
      >
        <View className="mb-2 flex-row items-center gap-1">
          {settled ? <Icon name="checkCircle" size={16} color={COLORS.doneInk} /> : null}
          <Text
            className="text-body font-extrabold"
            style={{ color: gone ? COLORS.alertInk : settled ? COLORS.doneInk : COLORS.brand }}
          >
            {TITLE[entry.kind] ?? ""}
          </Text>
        </View>

        <Text className="text-body-lg font-bold text-ink-strong">{when}</Text>
        {entry.schedule?.place ? (
          <Text className="mt-1 text-body text-ink-sub">
            {entry.schedule.place}
            {entry.schedule.staffName ? ` · ${entry.schedule.staffName}` : ""}
          </Text>
        ) : null}

        {/* **마지막 제안에만 붙는다.** 지난 카드의 버튼이 살아나면 두 번 수락된다 */}
        {answerable ? (
          <View className="mt-4 flex-row gap-2">
            <Pressable
              onPress={onAccept}
              accessibilityRole="button"
              accessibilityLabel="이때 만나기로 하기"
              className="flex-1 items-center rounded-xl py-3 active:opacity-90"
              style={{ backgroundColor: COLORS.brand }}
            >
              <Text className="text-body font-extrabold text-white">좋아요</Text>
            </Pressable>
            <Pressable
              onPress={onDecline}
              accessibilityRole="button"
              accessibilityLabel="이때는 어려워요"
              className="flex-1 items-center rounded-xl border border-line bg-white py-3 active:opacity-90"
            >
              <Text className="text-body font-semibold text-ink-sub">어려워요</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}
```

- [ ] **Step 3: 제안 시트를 만든다**

`src/features/visit/views/ProposeSheet.tsx`

```tsx
// 담당자가 만날 때를 고르는 시트 (§7.2 · 2026-08-26 결정 I-1).
//
// **상세 화면의 확정과 같은 부품을 쓴다.** 각자 만들면 한쪽만 고쳐지고 나머지가
// 조용히 남는다.
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { FramedModal } from "@/shared/components/FramedModal";
import { VisitTimeField } from "@/shared/components/VisitTimeField";
import { COLORS } from "@/shared/theme/colors";
import { isComplete, toIso, type VisitTime } from "@/shared/utils/visitTime";

export function ProposeSheet({
  /** 이미 정해진 장소. 있으면 장소 칸을 내지 않는다. */
  place,
  onPropose,
  onClose,
}: {
  place: string;
  onPropose: (whenIso: string, place: string) => void;
  onClose: () => void;
}) {
  const [when, setWhen] = useState<VisitTime>({});
  const [where, setWhere] = useState(place);
  const today = useMemo(() => new Date(), []);
  const ready = isComplete(when) && where.trim().length > 0;

  return (
    <FramedModal visible animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0 bg-black/40"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        />
        <View className="rounded-t-3xl bg-white px-5 pb-8 pt-5">
          <Text className="mb-4 text-heading font-extrabold text-ink-strong">
            만날 때 제안하기
          </Text>

          <Text className="mb-2 text-caption font-bold text-ink-header">만날 때</Text>
          <VisitTimeField
            value={when}
            onChange={setWhen}
            label="만날 때"
            today={today}
            titles={{
              month: "몇 월에 만나시나요",
              day: "며칠에 만나시나요",
              hour: "몇 시에 만나시나요",
            }}
          />

          {/* **이미 있으면 다시 묻지 않는다.** 매번 같은 것을 적게 하지 않는다 */}
          {place ? null : (
            <>
              <Text className="mb-2 mt-4 text-caption font-bold text-ink-header">만날 장소</Text>
              <TextInput
                className="rounded-xl border-[1.5px] border-line bg-white px-4 py-4 text-body-lg text-ink-strong"
                value={where}
                onChangeText={setWhere}
                placeholder="예: 2층 상담실"
                placeholderTextColor={COLORS.inkMuted}
                accessibilityLabel="만날 장소"
              />
            </>
          )}

          <Pressable
            onPress={() => {
              const iso = toIso(when);
              if (iso) onPropose(iso, where.trim());
            }}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
            accessibilityLabel="이 때로 제안하기"
            className="mt-6 items-center rounded-2xl py-4 active:opacity-90"
            style={{ backgroundColor: ready ? COLORS.brand : COLORS.brandMuted }}
          >
            <Text className="text-body-lg font-extrabold text-white">이 때로 제안하기</Text>
          </Pressable>
          {!ready ? (
            <Text className="mt-3 text-center text-caption text-ink-muted">
              만날 때와 장소를 모두 정해야 제안할 수 있습니다.
            </Text>
          ) : null}
        </View>
      </View>
    </FramedModal>
  );
}
```

- [ ] **Step 4: 채팅 화면에 얹는다**

`StaffChatScreen.tsx`의 말풍선 그리는 자리에서, `kind`가 `text`가 아니면 `ScheduleCard`를
그린다. `answerableCardId(messages, status)`로 버튼 여부를 정한다.

담당자(`myRole === "staff"`)일 때만 입력칸 위에 "만날 때 제안하기" 한 줄을 낸다.

- [ ] **Step 5: 검사와 커밋**

```bash
npx tsc --noEmit && npx eslint src && npx jest
git add src/features/visit/views/ScheduleCard.tsx \
        src/features/visit/views/ProposeSheet.tsx \
        src/features/visit/views/StaffChatScreen.tsx src/shared/utils/api.ts
git commit -m "feat(chat): 약속 카드를 대화에 그리고 채팅에서 제안한다

카드는 좌우 어느 쪽에도 붙지 않고 가운데에 선다 — 누가 보낸 말이 아니라 둘 사이에
정해진 일이기 때문이다.

제안 시트는 상세 화면의 확정과 같은 VisitTimeField를 쓴다. 각자 만들면 한쪽만
고쳐지고 나머지가 조용히 남는다."
```

---

## Task 14: 화면 — 사진 보내고 보기

**Files:**
- Create: `Majung-Frontend/src/features/visit/views/PhotoBubble.tsx`
- Modify: `Majung-Frontend/src/features/visit/views/StaffChatScreen.tsx`
- Modify: `Majung-Frontend/src/shared/utils/api.ts`

**Interfaces:**
- Consumes: `ChatEntry` (Task 12), 사진 창구 둘 (Task 11)
- Produces: `uploadVisitPhoto(token, visitId, file, clientMsgId)`, `visitPhotoUrl(visitId, messageId)`

- [ ] **Step 1: 창구를 잇는다**

`src/shared/utils/api.ts`

```ts
/**
 * POST /api/visits/{id}/photos — 사진을 보낸다 (§7.3 · 결정 I-3).
 *
 * **웹에서만 쓴다.** 앱은 `expo-image-picker`가 필요하고 그것은 새 의존성이라
 * 이번에 들이지 않는다.
 */
export async function uploadVisitPhoto(
  token: string,
  visitId: string,
  file: File,
  clientMsgId: string,
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  form.append("client_msg_id", clientMsgId);
  const res = await fetch(`${API_BASE}/api/visits/${encodeURIComponent(visitId)}/photos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
}

/**
 * 사진 한 장의 주소.
 *
 * **토큰이 URL에 들어간다.** `<img>`는 헤더를 못 붙이기 때문이다. 주소가 로그에
 * 남을 수 있으므로 이 주소를 화면 밖으로 내보내지 않는다 — 붙여넣기나 공유 대상이
 * 아니다.
 */
export function visitPhotoUrl(token: string, visitId: string, messageId: string): string {
  const id = encodeURIComponent(visitId);
  const mid = encodeURIComponent(messageId);
  return `${API_BASE}/api/visits/${id}/photos/${mid}?t=${encodeURIComponent(token)}`;
}
```

**서버가 쿼리의 `t`도 받아야 한다.** `read_photo`에서 `Authorization` 헤더가 없으면
쿼리 `t`를 세션 토큰으로 본다. 그 한 줄을 Task 11의 창구에 더한다.

- [ ] **Step 2: 사진 말풍선을 만든다**

`src/features/visit/views/PhotoBubble.tsx`

```tsx
// 대화에 붙는 사진 (§7.3 · 2026-08-26 결정 I-3).
//
// 눌러서 크게 본다. **저장 버튼을 두지 않는다** — 기기에 남기는 것은 사용자가
// 브라우저 기능으로 할 일이고, 우리가 권할 일은 아니다.
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { FramedModal } from "@/shared/components/FramedModal";
import { COLORS } from "@/shared/theme/colors";

export function PhotoBubble({ uri, mine }: { uri: string; mine: boolean }) {
  const [big, setBig] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View
        className={`my-1 max-w-[76%] rounded-2xl px-4 py-3 ${mine ? "self-end" : "self-start"}`}
        style={{ backgroundColor: COLORS.bubble }}
      >
        <Text className="text-body text-ink-sub">사진을 열지 못했어요.</Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setBig(true)}
        accessibilityRole="button"
        accessibilityLabel="사진 크게 보기"
        className={`my-1 max-w-[76%] overflow-hidden rounded-2xl ${mine ? "self-end" : "self-start"}`}
      >
        <Image
          source={{ uri }}
          style={{ width: 220, height: 220 }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      </Pressable>

      <FramedModal visible={big} animationType="fade" transparent onRequestClose={() => setBig(false)}>
        <Pressable
          className="flex-1 items-center justify-center bg-black/90"
          onPress={() => setBig(false)}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        >
          <Image source={{ uri }} style={{ width: "100%", height: "70%" }} resizeMode="contain" />
        </Pressable>
      </FramedModal>
    </>
  );
}
```

- [ ] **Step 3: 첨부 버튼을 붙인다**

`StaffChatScreen.tsx`의 입력칸 왼쪽에 사진 아이콘을 둔다. 웹에서는 숨은
`<input type="file" accept="image/jpeg,image/png,image/webp">`를 눌러 연다.

**고르면 바로 올라간다.** 미리보기를 두고 "보내기"를 한 번 더 누르게 하지 않는다 —
누를 것이 늘면 저리터러시 사용자가 중간에 멈춘다.

올라가는 동안 그 자리에 "보내는 중이에요", 실패하면 "보내지 못했어요 · 다시".

- [ ] **Step 4: 검사와 커밋**

```bash
npx tsc --noEmit && npx eslint src && npx jest
git add src/features/visit/views/PhotoBubble.tsx \
        src/features/visit/views/StaffChatScreen.tsx src/shared/utils/api.ts
git commit -m "feat(chat): 담당자 채팅에 사진을 붙인다 (웹)

고르면 바로 올라간다. 미리보기를 두고 보내기를 한 번 더 누르게 하지 않는다 —
누를 것이 늘면 저리터러시 사용자가 중간에 멈춘다.

앱(네이티브)은 expo-image-picker가 새 의존성이라 이번에 안 만든다."
```

---

## Task 15: 배포와 눈으로 확인

**Files:** 없음 (배포 작업)

- [ ] **Step 1: 양쪽 검사가 기준선인지 본다**

```bash
cd Majung-Backend && uv run ruff check . && uv run mypy app/ && uv run pytest -q
cd ../Majung-Frontend && npx tsc --noEmit && npx eslint src && npx jest
```

Expected: 서버 mypy 5건·pytest 6 failed 유지, 화면 tsc 0·eslint 12 errors 유지

- [ ] **Step 2: PR을 만들고 병합한다**

- [ ] **Step 3: 서버를 올리고 해시로 대조한다**

```bash
cd Majung-Backend
KEY="/c/Users/skwog/Documents/freedom_project/majung_backend.pem"
tar czf /tmp/mb.tar.gz --exclude=.venv --exclude=.git --exclude='*cache*' \
  app pyproject.toml uv.lock tests migrations
scp -i "$KEY" /tmp/mb.tar.gz ec2-user@3.34.251.223:/tmp/
ssh -i "$KEY" ec2-user@3.34.251.223 \
  'cd ~/majung-backend && tar xzf /tmp/mb.tar.gz && ~/.local/bin/uv sync --python 3.12 && sudo systemctl restart majung-backend'
```

`sha256sum`으로 바꾼 파일을 로컬과 대조한다. **배포 명령 성공은 배포본 최신을 뜻하지
않는다** — tar는 지워진 파일을 안 지운다.

- [ ] **Step 4: 새 창구가 도는지 본다**

```bash
curl -s -o /dev/null -w "accept: %{http_code}\n" -X POST \
  https://3-34-251-223.sslip.io/api/visits/00000000-0000-0000-0000-000000000000/accept
```

Expected: `401` (토큰이 없으므로 정상)

- [ ] **Step 5: 화면 배포를 기다리고 번들로 대조한다**

`majung365.vercel.app`의 번들을 받아 `만남이 예약되었어요`·`만날 때 제안하기`가 실렸는지
확인한다. 번들은 한글을 `\uXXXX`로 담으므로 그 형태로 센다.

- [ ] **Step 6: 손으로 확인한다**

1. 담당자로 로그인 → 요청 확인 → 채팅에서 "만날 때 제안하기" → 카드가 대화에 선다
2. 출소자 화면 → 같은 카드에 `[좋아요]` → **"만남이 예약되었어요" 카드가 새로 선다**
3. 내 정보 → 방문 확인 → **담당자 이름과 장소가 그대로 있다** (조용히 지워지던 자리)
4. 채팅에서 사진 보내기 → 양쪽에 뜨는지, 눌러서 크게 보이는지
5. 새로고침 → 카드와 사진이 그대로 있는지

---

## 자체 점검

**설계 대조**

| 설계 항목 | 과업 |
|---|---|
| 상태 기계 재사용 | 7·8 |
| 제안 시 장소 검증 | 7 |
| `POST /accept` 몸통 없음 | 8 |
| ⚠ 담당자·장소가 지워지지 않음 | 8 (테스트 둘) |
| 약속 카드가 대화에 남음 | 2·4·9 |
| 버튼을 저장하지 않음 | 3·12 |
| 새 소켓 이벤트 없이 `new_message` 확장 | 5 |
| `kind` 없으면 `text` | 4·12 |
| 상태 먼저, 카드 뒤 | 9 |
| 사진 암호화 | 1·10 |
| 저장소 먼저, DB 뒤 | 11 |
| 서명 URL을 대화에 안 실음 | 5·11 |
| 5MB·형식 제한 | 11 |
| 계정 삭제 시 파일도 지움 | 10 |
| 앱(네이티브) 제외 | 14 |

**빠진 것**: `visit_updated` 이벤트는 결국 안 만들었다. 약속 카드가 `new_message`로
나가면서 화면이 그것만으로 상태를 알 수 있고, 상태 자체는 채팅을 닫을 때 다시 읽는다.
**설계의 그 절은 카드를 대화에 남기기로 하면서 필요가 없어졌다** — 이벤트를 하나 덜
만드는 쪽이 맞다.
