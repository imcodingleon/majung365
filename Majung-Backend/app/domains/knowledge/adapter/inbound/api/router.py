"""POST /api/onboarding/analyze — 온보딩 분석(C6+C7) 인바운드 어댑터.

Router는 검증·DTO 변환만. 비즈니스 로직은 UseCase에.
비스트리밍 JSON — 그래프 계산(C7)은 O(V+E) 즉시, 마지막 자유서술이 있을 때만 C6 호출로 약간 지연.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.domains.knowledge.application.dto import AnalyzeCommand, NodeAnswer
from app.domains.knowledge.domain.graph_engine import NodeState
from app.infrastructure.config.settings import get_settings
from app.infrastructure.security.rate_limit import limiter

router = APIRouter(prefix="/api", tags=["onboarding"])

_VALID_STATES = {s.value for s in NodeState}
_MAX_NARRATIVE_LEN = 1000
# 온보딩은 코어 노드만 답하지만, "완료 처리" 재계산 시엔 이전 응답의 resolved_states
# 전부를 그대로 되돌려보낸다 — 그래프 전체 노드 수까지 허용한다.
_MAX_ANSWERS = 12


class NodeAnswerIn(BaseModel):
    node_id: str = Field(min_length=1, max_length=64)
    state: str  # "O" | "X" | "BLOCKED" | "UNKNOWN"


class AnalyzeIn(BaseModel):
    answers: list[NodeAnswerIn] = Field(min_length=1, max_length=_MAX_ANSWERS)
    # 온보딩 마지막 "그 밖에 하고 싶은 말" 자유서술(선택).
    narrative: str | None = Field(default=None, max_length=_MAX_NARRATIVE_LEN)


class TaskCardOut(BaseModel):
    node_id: str
    node_name: str
    summary_easy: str
    where: str
    docs: list[str]
    next_step: str
    deadline: str | None
    source_url: str
    priority_reason: str
    duration_days: int
    is_fallback: bool
    resolved_states: dict[str, str]
    benefit_summary: str
    eligibility: list[str]
    steps: list[str]
    cautions: list[str]


def _to_command(body: AnalyzeIn) -> AnalyzeCommand:
    answers: list[NodeAnswer] = []
    for a in body.answers:
        if a.state not in _VALID_STATES:
            raise HTTPException(status_code=400, detail="상태 값이 올바르지 않아요.")
        answers.append(NodeAnswer(node_id=a.node_id, state=NodeState(a.state)))
    narrative = body.narrative.strip() if body.narrative else None
    return AnalyzeCommand(answers=tuple(answers), narrative=narrative or None)


@router.post("/onboarding/analyze", response_model=TaskCardOut)
@limiter.limit(get_settings().rate_limit_chat)
async def analyze(body: AnalyzeIn, request: Request) -> TaskCardOut:
    spend = request.app.state.spend
    usecase = request.app.state.analyze_usecase

    # 자유서술이 있을 때만 실제 LLM 호출(C6)이 일어나므로, 있을 때만 조기 차단한다.
    if body.narrative and body.narrative.strip() and not spend.check():
        raise HTTPException(
            status_code=429, detail="지금 이용이 많아요. 잠시 후 다시 시도해 주세요."
        )

    command = _to_command(body)
    card = await usecase.run(command)

    return TaskCardOut(
        node_id=card.node_id,
        node_name=card.node_name,
        summary_easy=card.summary_easy,
        where=card.where,
        docs=list(card.docs),
        next_step=card.next_step,
        deadline=card.deadline,
        source_url=card.source_url,
        priority_reason=card.priority_reason,
        duration_days=card.duration_days,
        is_fallback=card.is_fallback,
        resolved_states={nid: st.value for nid, st in card.resolved_states.items()},
        benefit_summary=card.benefit_summary,
        eligibility=list(card.eligibility),
        steps=list(card.steps),
        cautions=list(card.cautions),
    )
