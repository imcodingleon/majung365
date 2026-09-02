"""POST /api/gate, POST /api/chat(SSE) — 챗 인바운드 어댑터.

방어 순서(스트림 시작 전): 게이트 토큰 → rate limit(데코레이터) → 지출 서킷브레이커.
Router는 검증·DTO 변환·SSE 직렬화만. 비즈니스 로직은 UseCase에.
"""

import json
import logging
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
    SuggestionsEvent,
    TextEvent,
    TriageEvent,
    Turn,
)
from app.domains.knowledge.domain.state import IntakeState, IntakeStateRepository
from app.domains.shared.clock import today_kst
from app.domains.shared.profile import MaskedProfile, Profile, mask_profile
from app.domains.shared.routes import RouteId
from app.infrastructure.config.settings import get_settings
from app.infrastructure.security.rate_limit import limiter

logger = logging.getLogger("majung.chat")

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


def _intake_of(request: Request, account: Account | None) -> IntakeState | None:
    """그 사람의 진단 판정. **없어도 대화는 그대로 진행된다.**

    저장소가 아직 안 붙었거나(Supabase 미설정) 저장이 꺼져 있던 때 가입한 사람은
    판정이 없다. `state.py`가 "실패해도 예외를 밖으로 던지지 않는다"를 원칙으로
    두었으므로 여기서도 삼키고 `None`으로 둔다 — 판정을 못 읽었다고 답변이
    막히면 안 된다.
    """
    states: IntakeStateRepository | None = getattr(
        request.app.state, "intake_state_repo", None
    )
    if states is None or account is None:
        return None
    try:
        return states.by_user(account.id)
    except Exception:
        logger.warning("진단 판정 조회 실패 — 판정 없이 답한다")
        return None


def _profile_of(request: Request, account: Account | None) -> MaskedProfile | None:
    """그 사람의 마스킹된 프로필 (기획서 §9.4). **없어도 대화는 그대로 진행된다.**

    수용 사유 동의는 선택이고(§3.3-⑥) 철회하면 그 행만 지워지므로, 없는 것이 정상
    경로다. `_intake_of`와 같이 실패를 삼킨다 — 조회를 못 했다고 답변이 막히면 안 된다.

    **원본 `Profile`은 이 함수 밖으로 나가지 않는다.** 여기서 만들어 즉시
    `MaskedProfile`이 되므로 이름과 생년월일이 유스케이스로 흘러갈 길이 없다.
    """
    if account is None:
        return None
    category: str | None = None
    crimes = getattr(request.app.state, "crime_repo", None)
    if crimes is not None:
        try:
            row = crimes.by_user(account.id)
            category = row.category if row else None
        except Exception:
            logger.warning("수용 사유 조회 실패 — 그 정보 없이 답한다")
    return mask_profile(
        Profile(
            name=account.name,
            birth_date=account.birth_date,
            release_date=account.release_date,
            crime_category=category,
        ),
        today_kst(),
    )


def _to_command(
    body: ChatIn,
    user_name: str | None = None,
    intake: IntakeState | None = None,
    profile: MaskedProfile | None = None,
) -> ChatCommand:
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
        message=body.message.strip(),
        history=tuple(turns),
        route_id=route_id,
        user_name=user_name,
        intake=intake,
        profile=profile,
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

    # **이름은 지우려고 싣는다.** 로그인하지 않았으면 없는 채로 간다.
    command = _to_command(
        body,
        account.name if account else None,
        _intake_of(request, account),
        _profile_of(request, account),
    )
    if not command.message:  # 공백/개행만 입력 → strip 후 빈 문자열 방지
        raise HTTPException(status_code=400, detail="메시지를 입력해 주세요.")

    async def event_stream() -> AsyncIterator[dict[str, str]]:
        # 사용자가 한 말은 먼저 남긴다. 답이 실패해도 물어본 것은 남아야
        # 다시 열었을 때 무엇을 묻다 말았는지 안다.
        if account and messages:
            messages.append(account.id, command.route_id, "user", command.message)

        answer: list[str] = []
        # 이 답변에 딸린 다음 질문 제안. **못 만들면 빈 채로 남고 그대로 저장된다.**
        suggestions: tuple[str, ...] = ()
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
            elif isinstance(ev, SuggestionsEvent):
                # **답변과 같은 행에 저장한다**(§6.3). 다시 열었을 때 이어서 물을
                # 것도 함께 있어야 저장하기로 한 뜻이 산다. 저장은 done에서 한 번에
                # 하므로 여기서는 담아만 둔다.
                suggestions = ev.questions
                yield {
                    "event": "suggestions",
                    "data": json.dumps(
                        {"questions": list(ev.questions)}, ensure_ascii=False
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
                        account.id,
                        command.route_id,
                        "assistant",
                        "".join(answer),
                        suggestions=suggestions,
                    )
                yield {"event": "done", "data": "{}"}

    return EventSourceResponse(event_stream())


# ── 방별 대화 (§6.1·§6.3) ──


class StoredMessageOut(BaseModel):
    role: str
    content: str
    at: str
    # 그 답변에 딸렸던 다음 질문 제안 (§6.1). 답변 턴에만 있고, 못 만든 답변에는
    # 없다. **비어 오는 것이 정상 경로다.**
    suggestions: list[str] = Field(default_factory=list)


class ChatRoomOut(BaseModel):
    """상담 탭 목록 한 줄. **방 전체가 아니라 한 줄 미리보기만 담는다.**"""

    route_id: str
    #: 마지막으로 오간 말. 못 읽었으면 빈 문자열이다.
    preview: str = ""
    #: 마지막으로 말한 때(ISO 8601). 목록 순서를 이 값으로 정한다.
    at: str


@router.get("/chat-rooms", response_model=list[ChatRoomOut])
def list_rooms(request: Request, account: CurrentAccount) -> list[ChatRoomOut]:
    """대화가 있는 할 일들과 마지막으로 오간 말. 최근에 말한 것이 앞에 온다.

    **상담 탭이 이것 없이는 목록을 그릴 수 없었다.** 방을 열어야 대화가 오는 구조라,
    앱을 다시 켜면 어디서 이야기했는지 화면이 알 방법이 없었다.

    방 전체를 담지는 않는다. 목록에 필요한 것은 마지막 한 줄뿐이다.
    """
    messages = getattr(request.app.state, "message_repo", None)
    if messages is None:
        return []
    rooms = getattr(messages, "rooms", None)
    if not callable(rooms):
        return []
    return [
        ChatRoomOut(route_id=r.route_id, preview=r.preview, at=r.at.isoformat())
        for r in rooms(account.id)
    ]


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
        StoredMessageOut(
            role=m.role,
            content=m.content,
            at=m.at.isoformat(),
            suggestions=list(m.suggestions),
        )
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
