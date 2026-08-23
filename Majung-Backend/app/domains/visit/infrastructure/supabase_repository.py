"""방문 요청 저장소 (Infrastructure) — 기획서 §7.

"하고 싶은 말"은 사용자가 직접 쓴 자유 입력이라 **암호화한다.** 사적인 사정이
담기고, 담당자 화면은 공용 기기일 수 있다.

담당자 쪽 조회는 지부 필터를 설정으로 켜고 끈다(§8.2). 해커톤에서는 어느 지부로
보냈든 한 화면에서 받아야 시연이 되지만, 확장 시점에 설정 하나로 좁혀진다.
"""

import json
import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from supabase import Client

from app.domains.staff.domain.entity import OrgKind
from app.domains.visit.domain.entity import (
    OPEN_STATUSES,
    SharedAnswer,
    VisitRequest,
    VisitStatus,
)
from app.infrastructure.security.crypto import CryptoError, FieldCipher

logger = logging.getLogger("majung.visit")


def _parse_ts(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


class SupabaseVisitRepository:
    def __init__(self, client: Client, cipher: FieldCipher) -> None:
        self._db = client
        self._cipher = cipher

    def _to_entity(self, row: dict[str, Any], staff_name: str = "") -> VisitRequest:
        note = ""
        if row.get("note_enc"):
            try:
                note = self._cipher.decrypt(str(row["note_enc"]))
            except CryptoError:
                # 한 건이 깨졌다고 목록 전체가 안 열리면 안 된다.
                logger.warning("방문 요청 메모를 읽지 못했다")

        created = _parse_ts(str(row["created_at"]))
        preferred_1 = _parse_ts(str(row["preferred_at_1"]))
        assert preferred_1 is not None  # not null 컬럼
        return VisitRequest(
            id=UUID(str(row["id"])),
            user_id=UUID(str(row["user_id"])),
            route_id=str(row["route_id"]),
            org_kind=OrgKind(str(row["org_kind"])),
            status=VisitStatus(str(row["status"])),
            preferred_at_1=preferred_1,
            preferred_at_2=_parse_ts(row.get("preferred_at_2")),
            prepared_docs=tuple(row.get("prepared_docs") or []),
            note=note,
            created_at=created,
            assigned_staff_id=(
                UUID(str(row["assigned_staff_id"])) if row.get("assigned_staff_id") else None
            ),
            assigned_staff_name=staff_name,
            meeting_place=str(row.get("meeting_place") or ""),
            confirmed_at=_parse_ts(row.get("confirmed_at")),
            confirmed_for=_parse_ts(row.get("confirmed_for")),
            proposed_at=_parse_ts(row.get("proposed_at")),
            cancel_reason=str(row.get("cancel_reason") or ""),
            user_read_at=_parse_ts(row.get("user_read_at")),
            staff_read_at=_parse_ts(row.get("staff_read_at")),
            shared_answers=self._shared_answers(row),
            shared_answers_consented_at=_parse_ts(
                row.get("shared_answers_consented_at")
            ),
        )

    def _shared_answers(self, row: dict[str, Any]) -> tuple[SharedAnswer, ...]:
        raw = row.get("shared_answers_enc")
        if not raw:
            return ()
        try:
            rows = json.loads(self._cipher.decrypt(str(raw)))
        except (CryptoError, ValueError):
            # 한 건이 깨졌다고 요청 자체가 안 열리면 안 된다. 다만 일부만 보여주면
            # 담당자가 그것을 전부로 오해하므로 통째로 뺀다.
            logger.warning("공유 답변을 읽지 못했다")
            return ()
        return tuple(
            SharedAnswer(
                route_id=str(r.get("route_id", "")),
                section=str(r.get("section", "")),
                question=str(r.get("question", "")),
                answer=str(r.get("answer", "")),
            )
            for r in rows
            if isinstance(r, dict)
        )

    def _rows(self, result: object) -> list[dict[str, Any]]:
        data = getattr(result, "data", None)
        return [r for r in (data or []) if isinstance(r, dict)]

    def _staff_names(self, rows: list[dict[str, Any]]) -> dict[str, str]:
        """확정된 요청에 붙일 담당자 표시명.

        **id만 돌려주면 확정 응답이 반쪽이 된다** — 사용자에게 필요한 것은 UUID가
        아니라 "누구를 찾아가면 되는가"이다. 요청 건수만큼 조회하지 않도록 한 번에
        모아서 가져온다.
        """
        ids = {str(r["assigned_staff_id"]) for r in rows if r.get("assigned_staff_id")}
        if not ids:
            return {}
        result = (
            self._db.table("staff_account")
            .select("id, display_name")
            .in_("id", sorted(ids))
            .execute()
        )
        return {str(r["id"]): str(r["display_name"]) for r in self._rows(result)}

    def _to_entities(self, rows: list[dict[str, Any]]) -> list[VisitRequest]:
        names = self._staff_names(rows)
        return [
            self._to_entity(r, names.get(str(r.get("assigned_staff_id")), ""))
            for r in rows
        ]

    def create(
        self,
        *,
        user_id: UUID,
        route_id: str,
        org_kind: OrgKind,
        preferred_at_1: datetime,
        preferred_at_2: datetime | None,
        prepared_docs: list[str],
        note: str,
        shared_answers: list[dict[str, str]] | None = None,
        consented_at: datetime | None = None,
    ) -> VisitRequest:
        result = (
            self._db.table("visit_request")
            .insert(
                {
                    "user_id": str(user_id),
                    "route_id": route_id,
                    "org_kind": org_kind.value,
                    "preferred_at_1": preferred_at_1.isoformat(),
                    "preferred_at_2": (
                        preferred_at_2.isoformat() if preferred_at_2 else None
                    ),
                    "prepared_docs": prepared_docs,
                    "note_enc": self._cipher.encrypt(note) if note else None,
                    # 동의가 없으면 답변도 없다. 어댑터가 먼저 막지만 여기서도
                    # 짝을 지어 둔다 — 한쪽만 저장되는 경우를 만들지 않는다.
                    "shared_answers_enc": (
                        self._cipher.encrypt(
                            json.dumps(shared_answers, ensure_ascii=False)
                        )
                        if shared_answers and consented_at
                        else None
                    ),
                    "shared_answers_consented_at": (
                        consented_at.isoformat()
                        if shared_answers and consented_at
                        else None
                    ),
                }
            )
            .execute()
        )
        rows = self._rows(result)
        if not rows:
            raise RuntimeError("방문 요청 저장에 실패했다")
        return self._to_entity(rows[0])

    def by_user(self, user_id: UUID) -> list[VisitRequest]:
        result = (
            self._db.table("visit_request")
            .select("*")
            .eq("user_id", str(user_id))
            .order("created_at", desc=True)
            .execute()
        )
        return self._to_entities(self._rows(result))

    def by_id(self, request_id: UUID) -> VisitRequest | None:
        result = (
            self._db.table("visit_request").select("*").eq("id", str(request_id)).execute()
        )
        rows = self._rows(result)
        return self._to_entities(rows)[0] if rows else None

    def for_staff(
        self, org_kind: OrgKind, branch: str | None, open_only: bool
    ) -> list[VisitRequest]:
        """담당자 목록. branch를 주면 그 지부 것만 본다(§8.2 접근 통제).

        지부는 요청이 아니라 **사용자의 지역**으로 갈려야 정확하지만, 지금은 좌표를
        받지 않아 서버가 지역을 모른다(§9.5). 그래서 필터를 켜도 지금 데이터로는
        걸러지지 않는다 — 구조만 두고 지역 정보가 생길 때 이 자리에 붙인다.
        """
        query = self._db.table("visit_request").select("*").eq("org_kind", org_kind.value)
        if open_only:
            query = query.in_("status", [s.value for s in OPEN_STATUSES])
        result = query.order("created_at", desc=True).limit(100).execute()
        return self._to_entities(self._rows(result))

    def update_status(
        self,
        request_id: UUID,
        status: VisitStatus,
        *,
        staff_id: UUID | None = None,
        meeting_place: str | None = None,
        confirmed_for: datetime | None = None,
        proposed_at: datetime | None = None,
        cancel_reason: str | None = None,
        now: datetime | None = None,
    ) -> None:
        patch: dict[str, Any] = {
            "status": status.value,
            "updated_at": (now or datetime.now()).isoformat(),
        }
        if status == VisitStatus.CONFIRMED:
            # 확정에는 담당자와 장소가 반드시 함께 간다 —
            # 하나라도 비면 "누구를 찾아가면 되는지"를 알려준다는 목적이 사라진다.
            patch["assigned_staff_id"] = str(staff_id) if staff_id else None
            patch["meeting_place"] = meeting_place
            patch["confirmed_at"] = (now or datetime.now()).isoformat()
            # **만나기로 한 시각.** confirmed_at(확정을 누른 시각)과 다르다.
            if confirmed_for is not None:
                patch["confirmed_for"] = confirmed_for.isoformat()
        if proposed_at is not None:
            patch["proposed_at"] = proposed_at.isoformat()
        if cancel_reason is not None:
            patch["cancel_reason"] = cancel_reason
        self._db.table("visit_request").update(patch).eq("id", str(request_id)).execute()
