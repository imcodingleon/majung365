"""판정 상태 저장소 (Infrastructure) — 기획서 §5.2·§9.1.

**판정을 암호화해 넣는다.** 답변 원문은 담지 않지만(0006·0008 참고) 어떤 지원
항목이 배정됐는지는 그 자체로 상황을 말한다 — R1(숙식제공)이 있으면 잘 곳이 없다는
뜻이다. 덜 구체적일 뿐 무해한 값이 아니라서 평문으로 두지 않는다.

**완료 여부는 평문이다** (§9.2가 나눈 구분 그대로다). 판정 목록을 이미 아는
사람에게 "그중 무엇을 마쳤는가"는 새로운 사실을 더해 주지 않는다.
"""

import json
import logging
from typing import Any
from uuid import UUID

from supabase import Client

from app.domains.knowledge.domain.graph_engine import NodeState
from app.domains.knowledge.domain.intake import IntakeVerdict
from app.domains.knowledge.domain.state import IntakeState
from app.domains.shared.routes import RouteId, SectionId
from app.infrastructure.security.crypto import CryptoError, FieldCipher

logger = logging.getLogger("majung.intake")


def _to_json(verdicts: tuple[IntakeVerdict, ...]) -> str:
    """판정을 JSON으로. **필드 이름을 짧게 줄이지 않는다** — 이 값은 오래 남고,
    나중에 읽는 사람이 무엇인지 알아볼 수 있어야 한다."""
    return json.dumps(
        [
            {
                "route_id": v.route_id.value,
                "section_id": v.section_id.value,
                "blocks_others": v.blocks_others,
                "state": v.state.value,
                "lead_override": v.lead_override,
                "override_is_specific": v.override_is_specific,
            }
            for v in verdicts
        ],
        ensure_ascii=False,
    )


def _from_json(raw: str) -> tuple[IntakeVerdict, ...]:
    """JSON을 판정으로. **알 수 없는 값이 든 항목은 건너뛴다.**

    지원 항목이 폐기되거나(R5가 그랬다) 상태값이 바뀌면 옛 행이 남는다. 그때
    통째로 실패시키면 그 사람은 화면을 영영 못 여는데, 한 항목을 빼고 여는 편이 낫다.
    """
    out: list[IntakeVerdict] = []
    for item in json.loads(raw):
        try:
            out.append(
                IntakeVerdict(
                    route_id=RouteId(item["route_id"]),
                    section_id=SectionId(item["section_id"]),
                    blocks_others=bool(item["blocks_others"]),
                    state=NodeState(item.get("state", NodeState.X.value)),
                    lead_override=str(item.get("lead_override", "")),
                    override_is_specific=bool(item.get("override_is_specific", False)),
                )
            )
        except (KeyError, ValueError, TypeError):
            logger.warning("판정 한 줄을 읽지 못해 건너뛴다")
    return tuple(out)


def _first_row(result: object) -> dict[str, Any] | None:
    data = getattr(result, "data", None)
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data[0]
    return None


class SupabaseIntakeStateRepository:
    def __init__(self, client: Client, cipher: FieldCipher) -> None:
        self._db = client
        self._cipher = cipher

    def save(self, user_id: UUID, verdicts: tuple[IntakeVerdict, ...]) -> None:
        """가입 직후 판정을 남긴다.

        **실패해도 예외를 던지지 않는다.** 이 저장이 안 됐다고 가입이 막히면
        27문항을 다시 답해야 한다. 복원은 편의이고 가입은 본체다.
        """
        try:
            self._db.table("intake_state").upsert(
                {
                    "user_id": str(user_id),
                    "verdicts_enc": self._cipher.encrypt(_to_json(verdicts)),
                    "completed": [],
                },
                on_conflict="user_id",
            ).execute()
        except Exception:
            # 판정 내용은 로그에 남기지 않는다 — 그 자체가 그 사람의 상황이다.
            logger.warning("판정 저장 실패 — 가입은 계속한다")

    def set_completed(self, user_id: UUID, completed: frozenset[str]) -> None:
        """마친 항목을 갱신한다. 실패하면 예외를 던진다 — 완료를 눌렀는데
        저장이 안 된 것을 사용자가 알아야 다시 누를 수 있다."""
        self._db.table("intake_state").update(
            {"completed": sorted(completed), "updated_at": "now()"}
        ).eq("user_id", str(user_id)).execute()

    def by_user(self, user_id: UUID) -> IntakeState | None:
        """복원용. 저장이 없거나 복호화가 실패하면 None."""
        try:
            result = (
                self._db.table("intake_state")
                .select("verdicts_enc, completed")
                .eq("user_id", str(user_id))
                .limit(1)
                .execute()
            )
        except Exception:
            logger.warning("판정 조회 실패")
            return None

        row = _first_row(result)
        if row is None:
            return None

        try:
            verdicts = _from_json(self._cipher.decrypt(str(row["verdicts_enc"])))
        except (CryptoError, ValueError, TypeError, KeyError):
            # **평문으로 넘어가지 않는다.** 못 읽으면 없는 것으로 다룬다.
            logger.warning("판정 복호화 실패")
            return None

        raw_completed = row.get("completed")
        completed = (
            frozenset(str(x) for x in raw_completed)
            if isinstance(raw_completed, list)
            else frozenset()
        )
        return IntakeState(verdicts=verdicts, completed=completed)
