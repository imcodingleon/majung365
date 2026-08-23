"""담당자 저장소 (Infrastructure) — 기획서 §8.2.

**계정을 만드는 메서드가 없다.** 해커톤 단계에서는 우리가 발급하고, 발급은
마이그레이션으로 넣는다. 스스로 가입하는 길을 열면 그게 곧 구멍이 된다 —
관리자 앱은 정의상 출소자 명단을 만들기 때문이다.

**열람 감사 로그를 여기서 남긴다.** §8.2의 전제 조건이고, 누가 언제 어떤 출소자의
정보를 열었는지 기록하지 못하면 열람 권한이 사실상 무제한과 같아진다.
"""

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from supabase import Client

from app.domains.staff.domain.entity import OrgKind, Staff, StaffSession
from app.domains.staff.domain.tokens import expires_at, hash_token, new_token

logger = logging.getLogger("majung.staff")


def _parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _first_row(result: object) -> dict[str, Any] | None:
    data = getattr(result, "data", None)
    if not isinstance(data, list) or not data:
        return None
    row = data[0]
    return row if isinstance(row, dict) else None


class SupabaseStaffRepository:
    def __init__(self, client: Client) -> None:
        self._db = client

    def by_login_id(self, login_id: str) -> tuple[Staff, str] | None:
        """계정과 저장된 비밀번호 해시. 비활성 계정은 없는 것으로 다룬다."""
        result = (
            self._db.table("staff_account")
            .select("*")
            .eq("login_id", login_id)
            .is_("disabled_at", "null")
            .execute()
        )
        row = _first_row(result)
        if row is None:
            return None
        return (
            Staff(
                id=UUID(str(row["id"])),
                login_id=str(row["login_id"]),
                org_kind=OrgKind(str(row["org_kind"])),
                branch=str(row["branch"]),
                display_name=str(row["display_name"]),
            ),
            str(row["password_hash"]),
        )

    def by_id(self, staff_id: UUID) -> Staff | None:
        result = (
            self._db.table("staff_account")
            .select("*")
            .eq("id", str(staff_id))
            .is_("disabled_at", "null")
            .execute()
        )
        row = _first_row(result)
        if row is None:
            return None
        return Staff(
            id=UUID(str(row["id"])),
            login_id=str(row["login_id"]),
            org_kind=OrgKind(str(row["org_kind"])),
            branch=str(row["branch"]),
            display_name=str(row["display_name"]),
        )


class SupabaseStaffSessionRepository:
    def __init__(self, client: Client) -> None:
        self._db = client

    def issue(self, staff_id: UUID, now: datetime) -> str:
        """토큰 원문은 이 반환값으로 딱 한 번 나간다.

        만료가 8시간이다 — 공용 기기에서 자리를 비웠을 때 명단이 열려 있는 시간을
        줄이는 것이 목적이라, 출소자 세션(90일)과 다른 기준을 쓴다.
        """
        token = new_token()
        self._db.table("staff_session").insert(
            {
                "token_hash": hash_token(token),
                "staff_id": str(staff_id),
                "expires_at": expires_at(now).isoformat(),
            }
        ).execute()
        return token

    def resolve(self, token: str, now: datetime) -> StaffSession | None:
        result = (
            self._db.table("staff_session")
            .select("staff_id, expires_at")
            .eq("token_hash", hash_token(token))
            .execute()
        )
        row = _first_row(result)
        if row is None:
            return None
        session = StaffSession(
            staff_id=UUID(str(row["staff_id"])),
            expires_at=_parse_ts(str(row["expires_at"])),
        )
        return session if session.is_valid(now) else None

    def revoke(self, token: str) -> None:
        """로그아웃. 공용 기기를 전제하므로 나갈 길이 있어야 한다."""
        self._db.table("staff_session").delete().eq(
            "token_hash", hash_token(token)
        ).execute()


class SupabaseAccessLogRepository:
    """열람 감사 로그 — §8.2 전제 조건 셋째.

    **사후에 추적할 수 없으면 통제가 아니다.**
    """

    def __init__(self, client: Client) -> None:
        self._db = client

    def record(self, staff_id: UUID, action: str, target_user_id: UUID | None) -> None:
        """기록이 실패해도 요청은 진행한다.

        판단이 갈리는 지점이다. 로그가 안 남으면 열람을 막는 편이 엄격하지만,
        그러면 로그 테이블 장애가 곧 서비스 중단이 된다. 지금은 진행하되
        **실패를 경고로 남긴다** — 로그가 비는 구간이 있다는 것 자체가 신호다.
        """
        try:
            self._db.table("staff_access_log").insert(
                {
                    "staff_id": str(staff_id),
                    "target_user_id": str(target_user_id) if target_user_id else None,
                    "action": action,
                }
            ).execute()
        except Exception:
            logger.warning("열람 로그 기록 실패 — action=%s", action)
