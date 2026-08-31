"""대화 내역 저장소 (Infrastructure) — 기획서 §6.3.

**본문을 암호화해 넣는다.** 대화에는 사용자가 가장 사적으로 말한 내용이 들어 있고,
자동 로그인 상태에서는 기기를 잡은 사람이 그것을 읽을 수 있다(§6.3-4). 그 위험은
대화별 삭제 경로로 완화하되 없앨 수는 없다.

**서버에 저장하는 것과 외부 API로 내보내는 것은 별개다.** 여기 들어가는 것은
원문이고, LLM으로 나갈 때는 마스킹을 그대로 거친다.
"""

import json
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
    # 그 답변에 딸렸던 다음 질문 제안 (§6.1). 답변 턴에만 있고, 못 만든 답변에는
    # 없다. **비는 것이 정상 경로다.**
    suggestions: tuple[str, ...] = ()


@dataclass(frozen=True)
class RoomSummary:
    """목록 한 줄에 필요한 것만. **방 전체를 내려받지 않는다.**"""

    route_id: str
    #: 마지막으로 오간 말. 못 읽었으면 빈 문자열이다.
    preview: str
    at: datetime


class SupabaseMessageRepository:
    def __init__(self, client: Client, cipher: FieldCipher) -> None:
        self._db = client
        self._cipher = cipher

    def append(
        self,
        user_id: UUID,
        route_id: str,
        role: str,
        content: str,
        suggestions: tuple[str, ...] = (),
    ) -> None:
        """한 줄 저장. 실패해도 예외를 밖으로 던지지 않는다 —
        **저장이 안 됐다고 대화가 멈추면 안 된다.** 지금 받는 답이 더 중요하다.

        **제안이 없으면 그 칸을 아예 넣지 않는다.** 마이그레이션(0011)이 아직
        안 올라간 서버에서도 평소 경로가 새 컬럼을 건드리지 않게 하려는 것이다.
        컬럼이 없는데 넣으면 insert가 통째로 실패하고, 이 함수가 예외를 삼키므로
        **오류도 없이 그 답변이 사라진다** — 다시 열었을 때 어제 받은 안내가
        없어지는 것이 §6.3이 막으려던 바로 그것이다.
        """
        row: dict[str, Any] = {
            "user_id": str(user_id),
            "route_id": route_id,
            "role": role,
            "content_enc": self._cipher.encrypt(content),
        }
        if suggestions:
            row["suggestions_enc"] = self._cipher.encrypt(
                json.dumps(list(suggestions), ensure_ascii=False)
            )
        try:
            self._db.table("chat_message").insert(row).execute()
        except Exception:
            # 사용자 입력 원문은 로그에 남기지 않는다.
            if "suggestions_enc" not in row:
                logger.warning("대화 저장 실패 — 대화는 계속한다")
                return
            # **제안을 빼고 한 번만 다시 시도한다.** 컬럼이 없는 서버라면 이쪽이
            # 통과한다. 제안은 잃어도 답변 본문은 남는다.
            row.pop("suggestions_enc")
            try:
                self._db.table("chat_message").insert(row).execute()
                logger.warning("추천 질문 칸 없이 저장했다 — 마이그레이션 0011을 확인하라")
            except Exception:
                logger.warning("대화 저장 실패 — 대화는 계속한다")

    def _rows_of(self, user_id: UUID, route_id: str, columns: str) -> list[dict[str, Any]]:
        result = (
            self._db.table("chat_message")
            .select(columns)
            .eq("user_id", str(user_id))
            .eq("route_id", route_id)
            # **최근 것부터 가져와 다시 뒤집는다.** 오름차순 + limit이면 가장
            # 오래된 100건이 오고, 100건을 넘긴 사람은 방을 열 때마다 맨 처음
            # 대화만 보게 된다 — 저장하기로 한 이유(§6.3)가 그대로 무효가 된다.
            .order("created_at", desc=True)
            .limit(_MAX_HISTORY)
            .execute()
        )
        return [r for r in (getattr(result, "data", None) or []) if isinstance(r, dict)]

    def history(self, user_id: UUID, route_id: str) -> list[StoredMessage]:
        """그 방의 지난 대화. 복호화에 실패한 줄은 건너뛴다 —
        한 줄이 깨졌다고 방 전체가 안 열리면 안 된다.

        **추천 질문 칸이 없는 서버에서도 열린다.** 마이그레이션(0011)이 아직 안
        올라갔으면 그 칸을 빼고 한 번 더 조회한다. 이 폴백이 없으면 조회가 예외로
        올라가 500이 되고, 화면은 그것을 조용히 삼켜(`useTaskThreads.open`)
        **그 방의 지난 대화가 통째로 안 열린다** — 오류 표시조차 없다.
        """
        try:
            rows = self._rows_of(
                user_id, route_id, "role, content_enc, suggestions_enc, created_at"
            )
        except Exception:
            logger.warning("추천 질문 칸 없이 조회한다 — 마이그레이션 0011을 확인하라")
            rows = self._rows_of(user_id, route_id, "role, content_enc, created_at")

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
                    suggestions=self._suggestions_of(row.get("suggestions_enc")),
                )
            )
        # 최근 것부터 받았으니 화면이 읽는 순서(시간순)로 되돌린다.
        messages.reverse()
        return messages

    def _suggestions_of(self, raw: object) -> tuple[str, ...]:
        """그 답변에 딸렸던 다음 질문. **못 읽으면 없는 것으로 둔다.**

        한 칸이 깨졌다고 답변까지 사라지면 안 된다 — 본문이 여전히 쓸모 있고,
        제안은 없어도 대화를 이어갈 수 있다. `rooms()`가 미리보기에 하는 처리와
        같은 결이다.
        """
        if not raw:
            return ()
        try:
            parsed = json.loads(self._cipher.decrypt(str(raw)))
        except (CryptoError, ValueError):
            logger.warning("추천 질문을 읽지 못했다 — 답변만 낸다")
            return ()
        if not isinstance(parsed, list):
            return ()
        return tuple(str(q) for q in parsed)

    def rooms(self, user_id: UUID) -> list[RoomSummary]:
        """대화가 있는 방들과 마지막으로 오간 말. 상담 탭의 목록이 이 값을 쓴다.

        **방마다 한 줄씩만 푼다.** 본문이 암호화되어 있어 미리 보여주려면 복호화가
        필요한데, 방은 열댓 개를 넘지 않으므로 그만큼만 푼다. 방 전체를 내려받는 것과는
        비용이 다르다 — 스무 방의 대화를 다 풀어 오는 것이 아니다.

        미리보기가 없으면 목록이 제목만 늘어선 표가 된다. 어제 어디까지 이야기했는지
        알 수 없어, 열어보기 전에는 무엇이 있는지 모른다.
        """
        result = (
            self._db.table("chat_message")
            .select("route_id, role, content_enc, created_at")
            .eq("user_id", str(user_id))
            .order("created_at", desc=True)
            # 방이 스무 개를 넘을 일이 없다. 넉넉히 두고 중복은 아래에서 접는다.
            .limit(500)
            .execute()
        )
        rows: list[dict[str, Any]] = [
            r for r in (getattr(result, "data", None) or []) if isinstance(r, dict)
        ]

        # 최근에 말한 방이 앞에 온다. 같은 방이 여러 번 나오므로 처음 것만 남긴다 —
        # 최근순으로 받았으니 처음 만나는 줄이 그 방의 마지막 말이다.
        found: list[RoomSummary] = []
        seen: set[str] = set()
        for row in rows:
            route_id = str(row.get("route_id") or "")
            if not route_id or route_id in seen:
                continue
            seen.add(route_id)
            try:
                preview = self._cipher.decrypt(str(row["content_enc"]))
            except CryptoError:
                # 한 줄이 깨졌다고 방이 목록에서 사라지면 안 된다. 미리보기만 비운다.
                logger.warning("미리보기를 읽지 못했다 — 방은 그대로 낸다")
                preview = ""
            found.append(
                RoomSummary(
                    route_id=route_id,
                    preview=preview,
                    at=datetime.fromisoformat(str(row["created_at"]).replace("Z", "+00:00")),
                )
            )
        return found

    def clear(self, user_id: UUID, route_id: str) -> None:
        """이 대화 지우기(§6.3-2). 경고로 막는 대신 지울 수 있게 하는 편이 낫다."""
        self._db.table("chat_message").delete().eq("user_id", str(user_id)).eq(
            "route_id", route_id
        ).execute()
