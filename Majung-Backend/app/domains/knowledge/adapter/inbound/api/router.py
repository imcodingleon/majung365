"""POST /api/onboarding/analyze · POST /api/intake/analyze — 진단 인바운드 어댑터.

onboarding은 예선의 그래프 9문항 기준이고, intake는 지금 구조인 27문항 기준이다.
프론트가 intake로 옮겨가면 onboarding을 걷어낸다.

Router는 검증·DTO 변환만. 비즈니스 로직은 UseCase에.
비스트리밍 JSON — 그래프 계산(C7)은 O(V+E) 즉시, 마지막 자유서술이 있을 때만 C6 호출로 약간 지연.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.domains.knowledge.application.dto import AnalyzeCommand, NodeAnswer
from app.domains.knowledge.domain.graph_engine import NodeState
from app.domains.shared.routes import RouteId
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


# ── POST /api/intake/analyze — 초기 진단 답변 → 할 일 목록 ──

_MAX_ANSWER_KEYS = 40  # 필수 14 + 꼬리 13에 여유. 화면에 없는 키가 대량으로 오는 것을 막는다
_MAX_ANSWER_LEN = 200
_MAX_MULTI = 20


class IntakeIn(BaseModel):
    """초기 진단 답변.

    **키가 사람마다 다르다.** 화면에 보이지 않은 문항의 답은 오지 않으므로(기획서 §3.8)
    서버는 특정 키가 항상 온다고 가정하지 않는다. optionId 값도 기획 검토 중이라
    서버가 값을 검사하지 않고 그대로 받아 판정 규칙에 넘긴다.
    """

    answers: dict[str, str | list[str]] = Field(default_factory=dict)
    # 이미 끝낸 항목(R1 등). 완료 처리는 프론트가 이 목록을 늘려 다시 부르는 것으로 돈다 —
    # 서버가 진행 상태를 들고 있지 않다.
    completed: list[str] = Field(default_factory=list, max_length=len(RouteId))
    # 마지막 자유서술. 이름·연락처가 섞여 들어올 수 있어 마스킹을 거친다.
    narrative: str | None = Field(default=None, max_length=_MAX_NARRATIVE_LEN)


class IntakeCardOptionOut(BaseModel):
    org: str
    where: str
    next_step: str
    docs: list[str]


class IntakeCardOut(BaseModel):
    institution_id: str
    name: str
    summary_easy: str
    docs: list[str]
    deadline: str | None
    source_url: str
    benefit_summary: str
    eligibility: list[str]
    steps: list[str]
    cautions: list[str]
    options: list[IntakeCardOptionOut]


class IntakeTaskOut(BaseModel):
    route_id: str
    route_label: str
    section_id: str
    section_label: str
    blocks_others: bool
    card: IntakeCardOut


class IntakeOut(BaseModel):
    tasks: list[IntakeTaskOut]


def _validate_answers(body: IntakeIn) -> dict[str, object]:
    if len(body.answers) > _MAX_ANSWER_KEYS:
        raise HTTPException(status_code=400, detail="답변이 너무 많아요.")
    cleaned: dict[str, object] = {}
    for key, value in body.answers.items():
        if isinstance(value, list):
            if len(value) > _MAX_MULTI or any(len(v) > _MAX_ANSWER_LEN for v in value):
                raise HTTPException(status_code=400, detail="답변 값이 올바르지 않아요.")
        elif len(value) > _MAX_ANSWER_LEN:
            raise HTTPException(status_code=400, detail="답변 값이 올바르지 않아요.")
        cleaned[key] = value
    return cleaned


@router.post("/intake/analyze", response_model=IntakeOut)
@limiter.limit(get_settings().rate_limit_chat)
def analyze_intake(body: IntakeIn, request: Request) -> IntakeOut:
    """초기 진단 답변으로 할 일 목록을 만든다. 세션도 저장도 없다.

    자유서술은 지금 판정에 쓰지 않는다 — 문항 답변만으로 항목이 갈린다.
    받아만 두고 버리는 값을 요청에 남겨두면 나중에 쓰이는 척이 되므로,
    쓰임이 정해지면 그때 연결한다.
    """
    usecase = request.app.state.intake_usecase
    answers = _validate_answers(body)

    valid = {r.value for r in RouteId}
    completed = frozenset(RouteId(c) for c in body.completed if c in valid)

    tasks = usecase.run(answers, completed)
    return IntakeOut(
        tasks=[
            IntakeTaskOut(
                route_id=t.route_id,
                route_label=t.route_label,
                section_id=t.section_id,
                section_label=t.section_label,
                blocks_others=t.blocks_others,
                card=IntakeCardOut(
                    institution_id=t.card.institution_id,
                    name=t.card.name,
                    summary_easy=t.card.summary_easy,
                    docs=list(t.card.docs),
                    deadline=t.card.deadline,
                    source_url=t.card.source_url,
                    benefit_summary=t.card.benefit_summary,
                    eligibility=list(t.card.eligibility),
                    steps=list(t.card.steps),
                    cautions=list(t.card.cautions),
                    options=[
                        IntakeCardOptionOut(
                            org=o.org, where=o.where, next_step=o.next_step, docs=list(o.docs)
                        )
                        for o in t.card.options
                    ],
                ),
            )
            for t in tasks
        ]
    )
