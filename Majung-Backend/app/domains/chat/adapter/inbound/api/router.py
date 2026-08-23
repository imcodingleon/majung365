"""POST /api/gate, POST /api/chat(SSE) — 챗 인바운드 어댑터.

방어 순서(스트림 시작 전): 게이트 토큰 → rate limit(데코레이터) → 지출 서킷브레이커.
Router는 검증·DTO 변환·SSE 직렬화만. 비즈니스 로직은 UseCase에.
"""

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

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
from app.infrastructure.config.settings import get_settings
from app.infrastructure.security.rate_limit import limiter

router = APIRouter(prefix="/api", tags=["chat"])

_MAX_MESSAGE_LEN = 2000
_MAX_TURN_LEN = 4000
_MAX_HISTORY = 20


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


@router.post("/gate", response_model=GateOut)
@limiter.limit(get_settings().rate_limit_gate)
def gate(body: GateIn, request: Request) -> GateOut:
    # 게이트 코드 무한 대입 방지 — 이 엔드포인트 자체를 빡빡하게 제한
    access = request.app.state.gate
    if not access.verify_code(body.code):
        raise HTTPException(status_code=401, detail="접근 코드가 올바르지 않아요.")
    return GateOut(token=access.issue_token())


def _extract_token(body: ChatIn, authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return body.token


def _to_command(body: ChatIn) -> ChatCommand:
    turns = [
        Turn(role=t.role, content=t.content[:_MAX_TURN_LEN])
        for t in body.history[-_MAX_HISTORY:]
        if t.role in ("user", "assistant") and t.content.strip()
    ]
    return ChatCommand(message=body.message.strip(), history=tuple(turns))


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

    # ① 게이트 토큰
    if not access.verify_token(_extract_token(body, authorization)):
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
        async for ev in usecase.run(command):
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
                yield {"event": "done", "data": "{}"}

    return EventSourceResponse(event_stream())
