"""채팅 메시지 저장소 (Infrastructure) — 기획서 §7.3.

**본문은 암호화해 저장한다.** 사적인 사정이 오가고 담당자 화면은 공용 기기일 수
있다. AI 채팅과 달리 마스킹은 하지 않는다 — 이쪽은 모델이 아니라 사람이 읽고,
전화번호나 주소를 지우면 담당자가 연락할 방법이 사라진다.
"""

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from supabase import Client

from app.domains.visit.domain.message import PAGE_SIZE, Message, SenderRole
from app.infrastructure.security.crypto import CryptoError, FieldCipher

logger = logging.getLogger("majung.visit")


def _parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class SupabaseMessageRepository:
    def __init__(self, client: Client, cipher: FieldCipher) -> None:
        self._db = client
        self._cipher = cipher

    def _to_entity(self, row: dict[str, Any]) -> Message | None:
        try:
            body = self._cipher.decrypt(str(row["body_enc"]))
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
        )

    def _rows(self, result: object) -> list[dict[str, Any]]:
        data = getattr(result, "data", None)
        return [r for r in (data or []) if isinstance(r, dict)]

    def add(
        self,
        *,
        visit_id: UUID,
        sender_role: SenderRole,
        body: str,
        client_msg_id: str = "",
        sender_staff_id: UUID | None = None,
    ) -> Message:
        """보낸다. 같은 `client_msg_id`가 이미 있으면 그것을 돌려준다 —
        **재전송이 대화를 두 번 채우면 안 된다.**"""
        if client_msg_id:
            existing = self._by_client_id(visit_id, client_msg_id)
            if existing is not None:
                return existing

        result = (
            self._db.table("visit_message")
            .insert(
                {
                    "visit_id": str(visit_id),
                    "sender_role": sender_role.value,
                    "sender_staff_id": str(sender_staff_id) if sender_staff_id else None,
                    "body_enc": self._cipher.encrypt(body),
                    "client_msg_id": client_msg_id or None,
                }
            )
            .execute()
        )
        rows = self._rows(result)
        if not rows:
            raise RuntimeError("메시지 저장에 실패했다")
        saved = self._to_entity(rows[0])
        if saved is None:
            # 방금 암호화한 것을 바로 못 읽으면 키 설정이 잘못된 것이다.
            raise RuntimeError("저장한 메시지를 다시 읽지 못했다")
        return saved

    def _by_client_id(self, visit_id: UUID, client_msg_id: str) -> Message | None:
        result = (
            self._db.table("visit_message")
            .select("*")
            .eq("visit_id", str(visit_id))
            .eq("client_msg_id", client_msg_id)
            .execute()
        )
        rows = self._rows(result)
        return self._to_entity(rows[0]) if rows else None

    def history(
        self, visit_id: UUID, *, before: datetime | None = None
    ) -> list[Message]:
        """방 하나의 대화. 최신부터 받아 시간순으로 돌려준다 —
        화면은 아래부터 그리지만 읽기는 위에서 아래로 한다."""
        query = (
            self._db.table("visit_message").select("*").eq("visit_id", str(visit_id))
        )
        if before is not None:
            query = query.lt("created_at", before.isoformat())
        result = query.order("created_at", desc=True).limit(PAGE_SIZE).execute()
        found = [m for m in (self._to_entity(r) for r in self._rows(result)) if m]
        return sorted(found, key=lambda m: m.created_at)

    def mark_read(self, visit_id: UUID, role: SenderRole, now: datetime) -> None:
        """여기까지 읽었다고 표시한다. 참여자가 둘뿐이라 요청 행에 둔다."""
        column = "user_read_at" if role == SenderRole.USER else "staff_read_at"
        self._db.table("visit_request").update({column: now.isoformat()}).eq(
            "id", str(visit_id)
        ).execute()
