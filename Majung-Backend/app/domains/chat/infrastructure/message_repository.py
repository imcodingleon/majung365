"""대화 내역 저장소 (Infrastructure) — 기획서 §6.3.

**본문을 암호화해 넣는다.** 대화에는 사용자가 가장 사적으로 말한 내용이 들어 있고,
자동 로그인 상태에서는 기기를 잡은 사람이 그것을 읽을 수 있다(§6.3-4). 그 위험은
대화별 삭제 경로로 완화하되 없앨 수는 없다.

**서버에 저장하는 것과 외부 API로 내보내는 것은 별개다.** 여기 들어가는 것은
원문이고, LLM으로 나갈 때는 마스킹을 그대로 거친다.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from supabase import Client

from app.infrastructure.security.crypto import CryptoError, FieldCipher

logger = logging.getLogger("majung.chat")

# 한 방에서 불러올 최대 개수. 오래된 것부터 잘라내지 않고 최근 것을 준다 —
# 방을 열면 이어서 말하지, 처음부터 다시 읽지 않는다.
_MAX_HISTORY = 100


@dataclass(frozen=True)
class StoredMessage:
    role: str  # user | assistant
    content: str
    at: datetime


class SupabaseMessageRepository:
    def __init__(self, client: Client, cipher: FieldCipher) -> None:
        self._db = client
        self._cipher = cipher

    def append(self, user_id: UUID, route_id: str, role: str, content: str) -> None:
        """한 줄 저장. 실패해도 예외를 밖으로 던지지 않는다 —
        **저장이 안 됐다고 대화가 멈추면 안 된다.** 지금 받는 답이 더 중요하다."""
        try:
            self._db.table("chat_message").insert(
                {
                    "user_id": str(user_id),
                    "route_id": route_id,
                    "role": role,
                    "content_enc": self._cipher.encrypt(content),
                }
            ).execute()
        except Exception:
            # 사용자 입력 원문은 로그에 남기지 않는다.
            logger.warning("대화 저장 실패 — 대화는 계속한다")

    def history(self, user_id: UUID, route_id: str) -> list[StoredMessage]:
        """그 방의 지난 대화. 복호화에 실패한 줄은 건너뛴다 —
        한 줄이 깨졌다고 방 전체가 안 열리면 안 된다."""
        result = (
            self._db.table("chat_message")
            .select("role, content_enc, created_at")
            .eq("user_id", str(user_id))
            .eq("route_id", route_id)
            # **최근 것부터 가져와 다시 뒤집는다.** 오름차순 + limit이면 가장
            # 오래된 100건이 오고, 100건을 넘긴 사람은 방을 열 때마다 맨 처음
            # 대화만 보게 된다 — 저장하기로 한 이유(§6.3)가 그대로 무효가 된다.
            .order("created_at", desc=True)
            .limit(_MAX_HISTORY)
            .execute()
        )
        rows: list[dict[str, Any]] = [
            r for r in (getattr(result, "data", None) or []) if isinstance(r, dict)
        ]

        messages: list[StoredMessage] = []
        for row in rows:
            try:
                content = self._cipher.decrypt(str(row["content_enc"]))
            except CryptoError:
                logger.warning("대화 한 줄을 읽지 못했다 — 건너뛴다")
                continue
            messages.append(
                StoredMessage(
                    role=str(row["role"]),
                    content=content,
                    at=datetime.fromisoformat(str(row["created_at"]).replace("Z", "+00:00")),
                )
            )
        # 최근 것부터 받았으니 화면이 읽는 순서(시간순)로 되돌린다.
        messages.reverse()
        return messages

    def clear(self, user_id: UUID, route_id: str) -> None:
        """이 대화 지우기(§6.3-2). 경고로 막는 대신 지울 수 있게 하는 편이 낫다."""
        self._db.table("chat_message").delete().eq("user_id", str(user_id)).eq(
            "route_id", route_id
        ).execute()
