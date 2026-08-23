"""POST /api/gate, POST /api/chat(SSE) — 챗 인바운드 어댑터.

방어 순서(스트림 시작 전): 게이트 토큰 → rate limit(데코레이터) → 지출 서킷브레이커.
Router는 검증·DTO 변환·SSE 직렬화만. 비즈니스 로직은 UseCase에.
"""

import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.domains.account.adapter.inbound.api.deps import current_account, require_account
from app.domains.account.domain.entity import Account
from app.domains.chat.application.dto import (
    CardEvent,
    ChatCommand,
    DoneEvent,
    ErrorEvent,
    EvidenceEvent,
    TextEvent,
    TriageEvent,
    Turn,
)
from app.domains.shared.routes import RouteId
from app.infrastructure.config.settings import get_settings
from app.infrastructure.security.rate_limit import limiter

router = APIRouter(prefix="/api", tags=["chat"])

# 세션으로 확인된 사용자. 대화 조회·삭제는 남의 것을 볼 수 없어야 한다.
CurrentAccount = Annotated[Account, Depends(require_account)]

_MAX_MESSAGE_LEN = 2000
_MAX_TURN_LEN = 4000
_MAX_HISTORY = 20
_KNOWN_ROUTES = frozenset(r.value for r in RouteId)


class GateIn(BaseModel):
    code: str = Field(min_length=1, max_length=200)


class GateOut(BaseModel):
    token: str


class TurnIn(BaseModel):
    role: str
    content: str


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=_MAX_MESSAGE_LEN)
    history: list[TurnIn] = Field(default_factory=list)
    token: str | None = None
    # 어느 할 일의 대화인가(§6.1). 항목에 매이지 않는 일반 대화는 비운다.
    route_id: str = Field(default="", max_length=8)


@router.post("/gate", response_model=GateOut)
@limiter.limit(get_settings().rate_limit_gate)
def gate(body: GateIn, request: Request) -> GateOut:
    # 게이트 코드 무한 대입 방지 — 이 엔드포인트 자체를 빡빡하게 제한
    access = request.app.state.gate
    if not access.verify_code(body.code):
        raise HTTPException(status_code=401, detail="접근 코드가 올바르지 않아요.")
    return GateOut(token=access.issue_token())


def _extract_gate_token(body: ChatIn) -> str | None:
    """게이트 토큰은 본문으로만 받는다.

    예전에는 Authorization 헤더도 봤는데, 그 헤더는 이제 **세션 토큰** 자리다(§2.4).
    한 헤더를 두 용도로 쓰면 게이트가 켜지는 순간 로그인한 사용자가 막힌다.
    게이트는 §2.3에서 폐지됐고 해시가 비면 자동 비활성이라, 본문 경로만 남겨도 된다.
    """
    return body.token


def _to_command(body: ChatIn) -> ChatCommand:
    turns = [
        Turn(role=t.role, content=t.content[:_MAX_TURN_LEN])
        for t in body.history[-_MAX_HISTORY:]
        if t.role in ("user", "assistant") and t.content.strip()
    ]
    # 모르는 항목 코드는 버린다 — 틀린 값으로 검색 범위를 좁히면
    # 맞는 근거까지 걸러진다. 그때는 없는 것으로 두고 triage가 판단한다.
    route_id = body.route_id.strip().upper()
    if route_id not in _KNOWN_ROUTES:
        route_id = ""
    return ChatCommand(
        message=body.message.strip(), history=tuple(turns), route_id=route_id
    )


@router.post("/chat")
@limiter.limit(get_settings().rate_limit_chat)
async def chat(
    body: ChatIn,
    request: Request,
    authorization: str | None = Header(default=None),
) -> EventSourceResponse:
    access = request.app.state.gate
    spend = request.app.state.spend
    usecase = request.app.state.chat_usecase
    # 로그인했으면 대화를 저장한다. 아니면 답만 하고 남기지 않는다 —
    # 가입 전에 챗을 열어보는 흐름을 막지 않는다.
    account = current_account(request, authorization)
    messages = getattr(request.app.state, "message_repo", None)

    # ① 게이트 토큰
    if not access.verify_token(_extract_gate_token(body)):
        raise HTTPException(status_code=401, detail="먼저 접근 코드로 입장해 주세요.")

    # ③ 지출 서킷브레이커 (스트림 시작 전 조기 차단, 읽기 전용 판정)
    if not spend.check():
        raise HTTPException(
            status_code=429, detail="지금 이용이 많아요. 잠시 후 다시 시도해 주세요."
        )

    command = _to_command(body)
    if not command.message:  # 공백/개행만 입력 → strip 후 빈 문자열 방지
        raise HTTPException(status_code=400, detail="메시지를 입력해 주세요.")

    async def event_stream() -> AsyncIterator[dict[str, str]]:
        # 사용자가 한 말은 먼저 남긴다. 답이 실패해도 물어본 것은 남아야
        # 다시 열었을 때 무엇을 묻다 말았는지 안다.
        if account and messages:
            messages.append(account.id, command.route_id, "user", command.message)

        answer: list[str] = []
        async for ev in usecase.run(command):
            if isinstance(ev, TextEvent):
                answer.append(ev.delta)
            if isinstance(ev, TriageEvent):
                yield {
                    "event": "triage",
                    "data": json.dumps(
                        {"routes": [r.__dict__ for r in ev.routes]}, ensure_ascii=False
                    ),
                }
            elif isinstance(ev, EvidenceEvent):
                yield {
                    "event": "evidence",
                    "data": json.dumps(
                        {"stage": ev.stage, "notice": ev.notice}, ensure_ascii=False
                    ),
                }
            elif isinstance(ev, TextEvent):
                yield {"event": "text", "data": json.dumps({"delta": ev.delta}, ensure_ascii=False)}
            elif isinstance(ev, CardEvent):
                c = ev.card
                yield {
                    "event": "card",
                    "data": json.dumps(
                        {
                            "institution_id": c.institution_id,
                            "name": c.name,
                            "route_label": c.route_label,
                            "summary_easy": c.summary_easy,
                            "where": c.where,
                            "docs": list(c.docs),
                            "next_step": c.next_step,
                            "deadline": c.deadline,
                            "source_url": c.source_url,
                            "benefit_summary": c.benefit_summary,
                            "eligibility": list(c.eligibility),
                            "steps": list(c.steps),
                            "cautions": list(c.cautions),
                            "source_urls": list(c.source_urls),
                            "verified_note": c.verified_note,
                            "options": [
                                {
                                    "org": o.org,
                                    "where": o.where,
                                    "next_step": o.next_step,
                                    "docs": list(o.docs),
                                    "desk_place": o.desk_place,
                                    "desk_say": o.desk_say,
                                    "contact_org": o.contact_org,
                                    "contact_phone": o.contact_phone,
                                    "contact_hours": o.contact_hours,
                                }
                                for o in c.options
                            ],
                        },
                        ensure_ascii=False,
                    ),
                }
            elif isinstance(ev, ErrorEvent):
                yield {
                    "event": "error",
                    "data": json.dumps({"message": ev.message}, ensure_ascii=False),
                }
            elif isinstance(ev, DoneEvent):
                if account and messages and answer:
                    messages.append(
                        account.id, command.route_id, "assistant", "".join(answer)
                    )
                yield {"event": "done", "data": "{}"}

    return EventSourceResponse(event_stream())


# ── 방별 대화 (§6.1·§6.3) ──


class StoredMessageOut(BaseModel):
    role: str
    content: str
    at: str


@router.get("/chat/{route_id}", response_model=list[StoredMessageOut])
def read_room(
    route_id: str,
    request: Request,
    account: CurrentAccount,
) -> list[StoredMessageOut]:
    """지난 대화. **저장하는 이유가 여기 있다** — 다시 켰을 때 어제 받은 안내가
    사라지면, 같은 안내를 여러 번 다시 읽는 사용자에게는 없느니만 못하다(§6.3)."""
    messages = getattr(request.app.state, "message_repo", None)
    if messages is None:
        return []
    return [
        StoredMessageOut(role=m.role, content=m.content, at=m.at.isoformat())
        for m in messages.history(account.id, route_id)
    ]


@router.delete("/chat/{route_id}", status_code=204)
def clear_room(route_id: str, request: Request, account: CurrentAccount) -> None:
    """이 대화 지우기(§6.3-2).

    닫을 때 "내용이 사라져요"로 경고하는 대신 지울 수 있게 한다. 대화에는 사용자가
    가장 사적으로 말한 내용이 들어 있고, 기기를 잡은 사람이 그것을 읽을 수 있다.
    """
    messages = getattr(request.app.state, "message_repo", None)
    if messages is not None:
        messages.clear(account.id, route_id)
