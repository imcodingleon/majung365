"""Mock 구현 — ChatLlm 포트. 실 Claude 없이 시나리오 기반 응답(무비용 데모).

키워드로 6영역을 분류하고, 쉬운 말 안내를 스트리밍처럼 흘려보낸다.
외부 호출 0 → 지출 0. ANTHROPIC_API_KEY가 없거나 USE_MOCK_LLM=true면 이걸 쓴다.

보안: 사용자 입력 원문을 로그에 남기지 않는다(이 파일은 로깅 자체를 하지 않는다).
환각 금지: 제도 카드(사실)는 UseCase가 KB에서 붙인다. 여기 텍스트는 '따뜻한 안내 틀'만.
"""

import asyncio
import re
from collections.abc import AsyncIterator

from app.domains.chat.application.dto import Turn
from app.domains.chat.domain.triage import (
    AreaPriority,
    QuestionType,
    TriageResult,
)
from app.domains.knowledge.domain.graph_engine import NodeState
from app.domains.shared.areas import Area

# 온보딩 마지막 자유서술 상태 판정 목업 — 우선순위: BLOCKED > X > O > (언급 없으면 제외)
# 문장 단위로 끊어서 판정한다(전체 훑기는 한 문장의 키워드가 다른 노드까지 오염시킴).
# 쉼표로 이어진 한 문장 안에 서로 다른 항목이 같이 나오면 목업은 구분 못 함 — 실제 Claude는
# 구조화 출력이라 이 한계가 없다. 데모용 근사치임을 인지하고 쓴다.
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_NAME_PARTS = re.compile(r"^([^(]*)(?:\(([^)]*)\))?(.*)$")
_BLOCKED_KEYWORDS = ("정지", "막혔", "막혀", "잠겼", "분실", "못 써", "못써", "끊겼", "끊김", "만료")  # noqa: E501
_NONE_KEYWORDS = ("없어요", "없습니다", "없음", "없고", "안 가지고", "못 받", "아직")
_HAVE_KEYWORDS = ("있어요", "있습니다", "가지고 있", "있음", "있고", "받았")


def _keywords_for(node_name: str) -> list[str]:
    """노드 이름에서 매칭용 키워드 후보를 뽑는다(데모용 근사치).
    "수용(출소)증명서" → 괄호 안이 동의어인 경우가 많아 ["수용증명서", "출소증명서"] 둘 다 후보로,
    "본인 명의 통장" → 축약형 "통장"도 후보로(사용자는 보통 줄여서 말한다)."""
    m = _NAME_PARTS.match(node_name)
    prefix, paren, suffix = (m.group(1), m.group(2) or "", m.group(3)) if m else (node_name, "", "")
    candidates = [f"{prefix}{suffix}".strip()]
    if paren:
        candidates.append(f"{paren}{suffix}".strip())
    candidates += [c.replace("본인 명의 ", "").strip() for c in list(candidates)]
    return [k for k in dict.fromkeys(candidates) if k]

# 영역별 키워드(쉬운 말·구어 포함). 튜플 순서 = 탐지 우선순위(급한 것부터).
# WELFARE는 보통 동반 영역이라 맨 뒤 — 다른 영역이 있으면 그 뒤로 붙는다.
_AREA_KEYWORDS: tuple[tuple[Area, tuple[str, ...]], ...] = (
    (Area.HOUSING, ("잘 곳", "잘곳", "머물", "지낼 곳", "갈 곳", "갈곳", "집", "숙소", "쉼터", "노숙", "주거")),  # noqa: E501
    (Area.IDENTITY, ("신분증", "주민등록", "통장", "계좌", "휴대폰", "핸드폰", "폰", "인증", "명의", "신분")),  # noqa: E501
    (Area.HEALTH, ("아프", "병원", "몸", "마음", "힘들", "우울", "불안", "포기", "죽", "상담")),
    (Area.EMPLOYMENT, ("취업", "일자리", "직장", "구직", "전과", "채용", "면접", "이력서")),
    (Area.DEBT, ("빚", "채무", "대출", "갚", "신용", "연체")),
    (Area.WELFARE, ("생활비", "생계", "돈", "밥", "먹", "굶", "긴급복지", "지원금", "복지", "급해", "만원")),  # noqa: E501
)

# 영역 특정이 안 되는 일반 진입("막 출소했어요" 등) → 기본 우선순위
_JUST_RELEASED = ("출소", "나왔", "막 나", "석방", "출감")
_DEFAULT_PRIORITIES: tuple[Area, ...] = (Area.IDENTITY, Area.WELFARE)

# 생계는 위기 상황(주거·신분)의 동반 영역 → 단독 주거/신분이면 생계도 함께 챙긴다
_WELFARE_COMPANIONS = (Area.HOUSING, Area.IDENTITY)

# triage 카드에 붙는 '왜 급한지'(쉬운 말)
_REASONS: dict[Area, str] = {
    Area.IDENTITY: "신분증·통장·휴대폰이 있어야 다른 신청도 시작할 수 있어요.",
    Area.WELFARE: "당장 먹고 자는 생계부터 나라 도움을 받을 수 있어요.",
    Area.HOUSING: "오늘 지낼 곳을 먼저 정하면 한결 마음이 놓여요.",
    Area.EMPLOYMENT: "일자리는 상담부터 천천히 준비할 수 있어요.",
    Area.HEALTH: "많이 힘든 마음, 혼자 두지 않아도 돼요.",
    Area.DEBT: "빚은 갚는 방법을 새로 짤 수 있어요.",
}

# 첫 문장(공감) — 가장 급한 영역 기준
_OPENING: dict[Area, str] = {
    Area.IDENTITY: "신분증이나 통장, 휴대폰이 막혀서 많이 답답하셨겠어요.",
    Area.WELFARE: "당장 먹고 지내는 게 급하셨겠어요.",
    Area.HOUSING: "오늘 지낼 곳이 없어 많이 불안하셨겠어요.",
    Area.EMPLOYMENT: "다시 일을 시작해 보려는 마음, 참 잘 오셨어요.",
    Area.HEALTH: "많이 지치고 힘드셨겠어요. 여기까지 오신 것만으로도 충분히 잘하고 계세요.",
    Area.DEBT: "빚 걱정으로 마음이 무거우셨겠어요.",
}

# 영역별 한 줄 안내(쉬운 말) — 카드의 구체 절차 앞에 놓는 방향 제시
_GUIDE: dict[Area, str] = {
    Area.IDENTITY: "먼저 신분증을 다시 마련하면, 통장과 휴대폰도 이어서 해결할 수 있어요.",
    Area.WELFARE: "생계가 급하면 주민센터나 129 전화로 긴급 도움을 요청할 수 있어요.",
    Area.HOUSING: "오늘 지낼 곳은 법무보호복지공단 생활관이나 긴급 주거지원으로 마련할 수 있어요.",  # noqa: E501
    Area.EMPLOYMENT: "이력이 걱정돼도 괜찮아요. 상담부터 시작해 훈련과 일자리를 함께 찾을 수 있어요.",  # noqa: E501
    Area.HEALTH: "많이 지친 마음은 무료 상담으로 먼저 돌볼 수 있어요.",
    Area.DEBT: "빚은 신용회복위원회 상담으로 갚는 방법을 새로 짤 수 있어요.",
}

# 실 LLM처럼 보이게 하는 타이밍(데모 현실감).
# triage 전 '생각하는 척' 지연 → 프론트 타이핑 인디케이터가 보인다. 안내는 어절 단위로 흘린다.
_THINK_DELAY_SECONDS = 0.7
_WORD_DELAY_SECONDS = 0.05


def _detect(message: str) -> tuple[QuestionType, tuple[Area, ...]]:
    """키워드로 질문 유형과 급한 영역(최대 3)을 정한다. 순수 함수."""
    hits: list[Area] = [
        area for area, kws in _AREA_KEYWORDS if any(k in message for k in kws)
    ]
    if not hits:
        if any(k in message for k in _JUST_RELEASED):
            return QuestionType.SUPPORT, _DEFAULT_PRIORITIES
        # 영역이 안 잡히는 일상·일반 질문 → 자유 답변(카드 없음)
        return QuestionType.DAILY, ()
    # 주거·신분 위기엔 생계를 동반으로 붙인다(demo-scenario 픽스처 정합)
    if Area.WELFARE not in hits and any(a in hits for a in _WELFARE_COMPANIONS):
        hits.append(Area.WELFARE)
    return QuestionType.SUPPORT, tuple(hits[:3])


def _compose(qtype: QuestionType, areas: tuple[Area, ...]) -> list[str]:
    """스트리밍할 안내 텍스트를 청크 리스트로 만든다. 순수 함수."""
    if qtype == QuestionType.DAILY or not areas:
        return [
            "말씀해 주셔서 고마워요. ",
            "제가 도울 수 있는 걸 함께 찾아볼게요.\n\n",
            "무엇이든 편하게 물어보셔도 돼요 — ",
            "예를 들어 '신분증을 다시 만들고 싶어요'처럼 ",
            "지금 가장 막막한 것을 말해 주시면, ",
            "어디로 가면 되는지 하나씩 알려드릴게요.",
        ]

    primary = areas[0]
    chunks: list[str] = [_OPENING[primary], " 천천히 함께 정리해 볼게요.\n\n"]
    chunks.extend(_GUIDE[a] + "\n" for a in areas)
    chunks.append(
        "\n아래 카드에 어디로 가면 되는지, 무슨 서류가 필요한지 적어 두었어요. "
        "한 번에 다 하지 않아도 돼요 — 위에 있는 것부터 하나씩만 보시면 됩니다."
    )
    if primary == Area.HEALTH:
        chunks.append(" 지금 많이 힘드시면 1577-0199(마음 상담)로 전화만 해도 괜찮아요.")
    return chunks


class MockChatLlm:
    """실 Claude 없이 동작하는 ChatLlm 구현(무비용 데모). 외부 호출 없음."""

    async def triage(self, message: str, history: list[Turn]) -> TriageResult:
        await asyncio.sleep(_THINK_DELAY_SECONDS)  # 생각하는 척 → 타이핑 인디케이터 노출
        qtype, areas = _detect(message)
        priorities = tuple(AreaPriority(area=a, reason=_REASONS[a]) for a in areas)
        return TriageResult(question_type=qtype, priorities=priorities)

    async def stream_guidance(
        self,
        *,
        message: str,
        history: list[Turn],
        context: str,
        allow_web_search: bool,
    ) -> AsyncIterator[str]:
        qtype, areas = _detect(message)
        text = "".join(_compose(qtype, areas))
        # 어절(공백/줄바꿈) 단위로 흘려 실 LLM 토큰 스트림처럼 보이게.
        buf = ""
        for ch in text:
            buf += ch
            if ch in (" ", "\n"):
                yield buf
                buf = ""
                await asyncio.sleep(_WORD_DELAY_SECONDS)
        if buf:
            yield buf

    async def extract_narrative_states(
        self, nodes: dict[str, str], narrative: str
    ) -> dict[str, NodeState]:
        await asyncio.sleep(_THINK_DELAY_SECONDS)  # 생각하는 척 → 분석 로딩 화면이 자연스레 보인다
        sentences = _SENTENCE_SPLIT.split(narrative)
        result: dict[str, NodeState] = {}
        for node_id, name in nodes.items():
            keywords = _keywords_for(name)
            sentence = next(
                (s for s in sentences if any(k in s for k in keywords)), None
            )
            if sentence is None:
                continue
            if any(k in sentence for k in _BLOCKED_KEYWORDS):
                result[node_id] = NodeState.BLOCKED
            elif any(k in sentence for k in _NONE_KEYWORDS):
                result[node_id] = NodeState.X
            elif any(k in sentence for k in _HAVE_KEYWORDS):
                result[node_id] = NodeState.O
        return result
