"""Mock 구현 — ChatLlm 포트. 실 Claude 없이 시나리오 기반 응답(무비용 데모).

키워드로 지원 항목(R1~R15)을 분류하고, 쉬운 말 안내를 스트리밍처럼 흘려보낸다.
외부 호출 0 → 지출 0. ANTHROPIC_API_KEY가 없거나 USE_MOCK_LLM=true면 이걸 쓴다.

보안: 사용자 입력 원문을 로그에 남기지 않는다(이 파일은 로깅 자체를 하지 않는다).
**`name`을 받고도 마스킹하지 않는다.** 외부 호출이 0이라 나갈 곳이 없다 — 포트를
만족시키려고 인자만 받는다.
환각 금지: 제도 카드(사실)는 UseCase가 KB에서 붙인다. 여기 텍스트는 '따뜻한 안내 틀'만.
"""

import asyncio
import json
import re
from collections.abc import AsyncIterator

from app.domains.chat.application.dto import Turn
from app.domains.chat.application.port import GuidanceChunk
from app.domains.chat.domain.triage import (
    QuestionType,
    RoutePriority,
    TriageResult,
)
from app.domains.knowledge.domain.graph_engine import NodeState
from app.domains.shared.routes import RouteId

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

# 항목별 키워드(쉬운 말·구어 포함). 튜플 순서 = 탐지 우선순위(급한 것부터).
# R2(공단 긴급지원)는 보통 동반 항목이라 맨 뒤 — 다른 항목이 있으면 그 뒤로 붙는다.
_ROUTE_KEYWORDS: tuple[tuple[RouteId, tuple[str, ...]], ...] = (
    (RouteId.R1, ("잘 곳", "잘곳", "머물", "지낼 곳", "갈 곳", "갈곳", "숙소", "쉼터", "노숙", "생활관")),  # noqa: E501
    (RouteId.R4, ("주거", "집", "월세", "보증금", "임대")),
    (RouteId.R9, ("신분증", "주민등록증", "신분")),
    (RouteId.R11, ("주민등록", "전입신고", "주소")),
    (RouteId.R10, ("통장", "계좌", "입금", "송금")),
    (RouteId.R13, ("출소증명", "수용증명", "증명서")),
    (RouteId.R8, ("마음", "힘들", "우울", "불안", "포기", "죽", "상담", "외로")),
    (RouteId.R3, ("아프", "병원", "몸", "치료", "다쳤")),
    (RouteId.R15, ("건강보험", "의료급여", "병원비", "약값")),
    (RouteId.R6, ("취업", "일자리", "직장", "구직", "전과", "채용", "면접", "이력서", "훈련")),
    (RouteId.R7, ("창업", "장사", "가게", "사업")),
    (RouteId.R14, ("빚", "채무", "대출", "갚", "신용", "연체", "파산", "회생", "압류")),
    (RouteId.R12, ("생계급여", "기초생활", "수급")),
    (RouteId.R2, ("생활비", "생계", "돈", "밥", "먹", "굶", "긴급복지", "지원금", "복지", "급해", "만원")),  # noqa: E501
)

# 항목 특정이 안 되는 일반 진입("막 출소했어요" 등) → 기본 우선순위.
# 그래프 진입점이 수용·출소증명서라, 목업도 같은 순서로 안내한다.
_JUST_RELEASED = ("출소", "나왔", "막 나", "석방", "출감")
_DEFAULT_PRIORITIES: tuple[RouteId, ...] = (RouteId.R13, RouteId.R9, RouteId.R2)

# 공단 긴급지원은 위기 상황(숙식·신분)의 동반 항목 → 단독이면 긴급지원도 함께 챙긴다
_EMERGENCY_COMPANIONS = (RouteId.R1, RouteId.R9)

# 첫 문장(공감) — 가장 급한 항목 기준
_OPENING: dict[RouteId, str] = {
    RouteId.R1: "오늘 지낼 곳이 없어 많이 불안하셨겠어요.",
    RouteId.R2: "당장 먹고 지내는 게 급하셨겠어요.",
    RouteId.R3: "몸이 아픈데 참고 계셨겠어요.",
    RouteId.R4: "지낼 곳 문제로 마음이 무거우셨겠어요.",
    RouteId.R6: "다시 일을 시작해 보려는 마음, 참 잘 오셨어요.",
    RouteId.R7: "직접 시작해 보려는 마음, 참 좋습니다.",
    RouteId.R8: "많이 지치고 힘드셨겠어요. 여기까지 오신 것만으로도 충분히 잘하고 계세요.",
    RouteId.R9: "신분증이 없어서 많이 답답하셨겠어요.",
    RouteId.R10: "통장이 막혀서 많이 답답하셨겠어요.",
    RouteId.R11: "주소 문제로 여기저기서 막히셨겠어요.",
    RouteId.R12: "생활비 걱정이 크셨겠어요.",
    RouteId.R13: "무엇부터 해야 할지 막막하셨겠어요.",
    RouteId.R14: "빚 걱정으로 마음이 무거우셨겠어요.",
    RouteId.R15: "병원비 걱정이 크셨겠어요.",
}

# 항목별 한 줄 안내(쉬운 말) — 카드의 구체 절차 앞에 놓는 방향 제시
_GUIDE: dict[RouteId, str] = {
    RouteId.R1: "오늘 지낼 곳은 법무보호복지공단 생활관으로 마련할 수 있어요.",
    RouteId.R2: "생계가 급하면 공단이나 주민센터에 긴급 도움을 요청할 수 있어요.",
    RouteId.R3: "아픈 곳이 있으면 공단 기초건강지원으로 진료를 받을 수 있어요.",
    RouteId.R4: "오래 지낼 집은 주거지원으로 함께 찾아볼 수 있어요.",
    RouteId.R6: "이력이 걱정돼도 괜찮아요. 상담부터 시작해 훈련과 일자리를 함께 찾을 수 있어요.",  # noqa: E501
    RouteId.R7: "직접 시작해 보고 싶다면 창업 상담과 지원을 받을 수 있어요.",
    RouteId.R8: "많이 지친 마음은 무료 상담으로 먼저 돌볼 수 있어요.",
    RouteId.R9: "신분증은 주민센터에서 다시 만들 수 있어요.",
    RouteId.R10: "통장은 가까운 은행 창구에서 만들 수 있어요.",
    RouteId.R11: "주소는 주민센터에서 전입신고로 등록할 수 있어요.",
    RouteId.R12: "매달 받는 생계급여는 주민센터 상담으로 대상인지 확인할 수 있어요.",
    RouteId.R13: "수용(출소)증명서는 나오신 교정시설에서 받을 수 있어요.",
    RouteId.R14: "빚은 신용회복위원회 상담으로 갚는 방법을 새로 짤 수 있어요.",
    RouteId.R15: "병원비는 의료급여 대상인지, 건강보험이 살아 있는지 먼저 확인하면 돼요.",
}

# 실 LLM처럼 보이게 하는 타이밍(데모 현실감).
# triage 전 '생각하는 척' 지연 → 프론트 타이핑 인디케이터가 보인다. 안내는 어절 단위로 흘린다.
_THINK_DELAY_SECONDS = 0.7
_WORD_DELAY_SECONDS = 0.05


def _detect(message: str) -> tuple[QuestionType, tuple[RouteId, ...]]:
    """키워드로 질문 유형과 급한 지원 항목(최대 3)을 정한다. 순수 함수."""
    hits: list[RouteId] = [
        route for route, kws in _ROUTE_KEYWORDS if any(k in message for k in kws)
    ]
    if not hits:
        if any(k in message for k in _JUST_RELEASED):
            return QuestionType.SUPPORT, _DEFAULT_PRIORITIES
        # 항목이 안 잡히는 일상·일반 질문 → 자유 답변(카드 없음)
        return QuestionType.DAILY, ()
    # 숙식·신분 위기엔 공단 긴급지원을 동반으로 붙인다(demo-scenario 픽스처 정합)
    if RouteId.R2 not in hits and any(r in hits for r in _EMERGENCY_COMPANIONS):
        hits.append(RouteId.R2)
    return QuestionType.SUPPORT, tuple(hits[:3])


def _compose(qtype: QuestionType, routes: tuple[RouteId, ...]) -> list[str]:
    """스트리밍할 안내 텍스트를 청크 리스트로 만든다. 순수 함수."""
    if qtype == QuestionType.DAILY or not routes:
        return [
            "말씀해 주셔서 고마워요. ",
            "제가 도울 수 있는 걸 함께 찾아볼게요.\n\n",
            "무엇이든 편하게 물어보셔도 돼요 — ",
            "예를 들어 '신분증을 다시 만들고 싶어요'처럼 ",
            "지금 가장 막막한 것을 말해 주시면, ",
            "어디로 가면 되는지 하나씩 알려드릴게요.",
        ]

    primary = routes[0]
    chunks: list[str] = [_OPENING[primary], " 천천히 함께 정리해 볼게요.\n\n"]
    chunks.extend(_GUIDE[r] + "\n" for r in routes)
    chunks.append(
        "\n아래 카드에 어디로 가면 되는지, 무슨 서류가 필요한지 적어 두었어요. "
        "한 번에 다 하지 않아도 돼요 — 위에 있는 것부터 하나씩만 보시면 됩니다."
    )
    if primary == RouteId.R8:
        chunks.append(" 지금 많이 힘드시면 1577-0199(마음 상담)로 전화만 해도 괜찮아요.")
    return chunks


class MockChatLlm:
    """실 Claude 없이 동작하는 ChatLlm 구현(무비용 데모). 외부 호출 없음."""

    async def triage(
        self,
        message: str,
        history: list[Turn],
        *,
        name: str | None = None,
        route_label: str = "",
    ) -> TriageResult:
        """**`route_label`을 쓰지 않는다.** 목업은 키워드 규칙으로만 고르며,
        방을 참고해 짐작을 고치는 것은 모델이 할 일이다. 그 효과는 실 Claude에서만
        확인된다 — 여기서 흉내내면 배선만 맞고 실제 판정은 안 본 채로 넘어간다."""
        await asyncio.sleep(_THINK_DELAY_SECONDS)  # 생각하는 척 → 타이핑 인디케이터 노출
        qtype, routes = _detect(message)
        priorities = tuple(RoutePriority(route=r) for r in routes)
        return TriageResult(question_type=qtype, priorities=priorities)

    async def stream_guidance(
        self,
        *,
        message: str,
        history: list[Turn],
        context: str,
        allow_web_search: bool,
        name: str | None = None,
    ) -> AsyncIterator[GuidanceChunk]:
        qtype, routes = _detect(message)
        text = "".join(_compose(qtype, routes))
        # 어절(공백/줄바꿈) 단위로 흘려 실 LLM 토큰 스트림처럼 보이게.
        buf = ""
        for ch in text:
            buf += ch
            if ch in (" ", "\n"):
                yield GuidanceChunk(text=buf)
                buf = ""
                await asyncio.sleep(_WORD_DELAY_SECONDS)
        if buf:
            yield GuidanceChunk(text=buf)

    async def suggest_questions(
        self, history: list[Turn], *, context: str = "", name: str | None = None
    ) -> tuple[str, ...]:
        """이어서 물어볼 만한 질문 (§6.1) — 목업.

        **내용을 지어내지 않는다.** 대화를 읽고 그럴싸한 질문을 만들면, 배선을
        확인하는 자리에서 제안 품질까지 확인한 것으로 오해한다. 어느 대화에서나
        말이 되는 고정 셋을 돌려주고, 실제 문장은 Claude가 만든다.

        **셋을 그대로 돌려준다.** 거르는 일은 유스케이스가 맡으므로 여기서
        개수를 맞출 이유가 없다 — 목업이 계약을 대신 지키면 그 계약이 실제로
        지켜지는지 알 수 없다.
        """
        await asyncio.sleep(_THINK_DELAY_SECONDS)
        return (
            "어디로 가면 돼요?",
            "무슨 서류가 필요해요?",
            "돈이 드나요?",
        )

    async def summarize_visit(self, *, text: str, name: str | None = None) -> str:
        """담당자가 먼저 읽는 요약 (§7.4) — 목업.

        **내용을 지어내지 않는다.** 답변 줄 수만 세어 틀을 돌려준다. 목업이 그럴싸한
        문장을 만들면 배선을 확인하는 자리에서 요약 품질까지 확인한 것으로 오해한다.
        """
        await asyncio.sleep(_THINK_DELAY_SECONDS)
        lines = [ln for ln in text.splitlines() if ln.startswith("- [")]
        has_note = "본인이 직접 쓴 말:" in text
        return json.dumps(
            {
                "headline": f"본인이 미리 답한 것이 {len(lines)}가지 있습니다.",
                "points": [
                    {"label": "답변", "text": "방문 목적과 이어지는 것부터 확인해 주시면 됩니다."},
                    {
                        "label": "직접 쓴 말",
                        "text": "본인이 적어 보낸 말이 함께 왔습니다."
                        if has_note
                        else "직접 쓴 말은 없습니다.",
                    },
                ],
                "prepare": ["무비용 데모 요약입니다 — 실제 문장은 Claude가 만듭니다."],
            },
            ensure_ascii=False,
        )

    async def extract_narrative_states(
        self, nodes: dict[str, str], narrative: str, *, name: str | None = None
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
