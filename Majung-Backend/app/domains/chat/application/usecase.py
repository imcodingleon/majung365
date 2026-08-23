"""ChatUseCase — triage → 카드 매칭(서버) → 쉬운 말 안내(스트리밍) 오케스트레이션.

'약사 모델': 안내 텍스트는 모델이 생성하되, 제도 카드(사실)는 서버가 KB에서 매칭해 붙인다.
모델은 제도명·신청처를 지어내지 않는다.

SSE 순서 계약: triage → evidence → text(델타*) → card* → done  (오류 시 error)
대화는 서버에 저장하지 않는다(멀티턴은 클라이언트가 history로 전달, 처리 후 폐기).
"""

import logging
from collections.abc import AsyncIterator
from dataclasses import replace

from app.domains.chat.application.dto import (
    CardData,
    CardEvent,
    CardOption,
    ChatCommand,
    ChatEvent,
    DoneEvent,
    ErrorEvent,
    EvidenceEvent,
    RouteOut,
    TextEvent,
    TriageEvent,
)
from app.domains.chat.application.port import ChatLlm
from app.domains.chat.domain.evidence import EvidenceStage, notice_for
from app.domains.chat.domain.prompts import build_guidance_context
from app.domains.chat.domain.triage import (
    QuestionType,
    ReasonCode,
    RoutePriority,
    TriageResult,
    reason_text,
)
from app.domains.knowledge.domain.contacts import contact_of, desk_of
from app.domains.knowledge.domain.entity import Institution
from app.domains.knowledge.domain.graph_engine import GraphNode, kb_ref_for_route
from app.domains.knowledge.domain.repository import InstitutionRepository
from app.domains.knowledge.domain.retrieval import Passage, PassageIndex
from app.domains.knowledge.domain.sources import verified_note
from app.domains.shared.routes import RouteId, label_for

logger = logging.getLogger("majung.chat")

_MAX_CARDS = 3
# 카드에서 연 대화라도 항목을 무한정 늘리지 않는다.
_MAX_ROUTES = 3
# 근거 구절에서 프롬프트로 넘길 길이. 문서당 평균 2,300자라 전부 넣으면
# 세 구절만으로 7천 자가 되고, 관련 없는 대목이 답변에 섞인다.
_PASSAGE_CHARS = 700


class ChatUseCase:
    def __init__(
        self,
        llm: ChatLlm,
        institutions: InstitutionRepository,
        blocking_routes: frozenset[str] = frozenset(),
        passages: PassageIndex | None = None,
        graph_nodes: dict[str, GraphNode] | None = None,
    ) -> None:
        self._llm = llm
        self._institutions = institutions
        # 다른 항목의 선행조건인 항목들. 그래프 구조에서 미리 뽑아 주입받는다 —
        # 챗이 그래프 전체를 알 필요는 없고 이 사실만 있으면 된다.
        self._blocking_routes = blocking_routes
        # 수집한 근거 문서. 없으면 KB 카드만으로 ①단계를 판정한다.
        self._passages = passages
        # 상태별로 대표가 갈리는 항목은 그래프가 정한다(§4.1). 초기 진단과 같은 자리다.
        self._nodes = graph_nodes or {}

    async def run(self, cmd: ChatCommand) -> AsyncIterator[ChatEvent]:
        history = list(cmd.history)

        # 1) triage (구조화)
        try:
            triage = await self._llm.triage(cmd.message, history)
        except Exception:
            logger.warning("triage 실패 (upstream)")  # 사용자 입력 원문은 로그에 남기지 않는다
            yield ErrorEvent()
            return

        # **카드에서 연 대화면 그 항목을 앞에 세운다**(§6.1). 사용자가 R14 카드를
        # 보다가 "다음에 뭘 해야 하나요"라고 물으면, 그 문장만으로는 무슨 얘기인지
        # 알 수 없다. 화면이 이미 답을 알고 있으니 모델이 다시 맞힐 이유가 없다.
        triage = self._pin_route(triage, cmd.route_id)

        yield TriageEvent(routes=self._to_route_out(triage))

        # 2) 카드 매칭 (서버, KB 밖 생성 금지)
        cards = self._match_cards(triage)

        # 3) 근거 문서 검색. 카드가 제도의 요약이라면 이쪽은 본문이라,
        #    "기한이 며칠인가요" 같은 구체적인 질문에 답할 수 있는 것은 이쪽이다.
        found = self._search_passages(cmd.message, triage, cmd.route_id)

        # 4) 근거 단계를 가린다. 확인된 자료에서 찾지 못했으면 인터넷을 찾아본다(§6.4).
        #    **사전 고지가 답변보다 먼저 나간다** — 나중에 "인터넷 정보였습니다"라고
        #    덧붙이면 이미 사용자는 그것을 사실로 받아들인 뒤다.
        #    **알려진 한계 (2026-08-24 확인, 고치지 않기로 함).**
        #
        #    카드가 질문과 무관해도 확인된 자료로 표시된다. "전기요금 깎아주는
        #    제도가 있나요"에 우리 KB에 전기요금이 없는데도 배지가 붙었다 —
        #    triage가 R2·R12를 골라 카드가 생겼기 때문이다.
        #
        #    두 가지를 시도했고 둘 다 실패했다.
        #
        #    ① 배지를 found 기준으로 좁히기 → 효과 없음. 전기요금 질문도 근거를
        #       찾는다. "제도"라는 흔한 말과 음절 2-gram만으로 16점을 넘긴다.
        #    ② 질문의 핵심어가 근거에 있어야 한다는 필터 → 훨씬 나빠짐.
        #       항목 일치가 11/12에서 5/12로 떨어졌다. "신분증 잃어버렸는데"에서
        #       가장 드문 말이 "잃어버렸는데"인데 그것은 핵심어가 아니다.
        #
        #    MIN_SCORE를 올리면 전기요금(16.1)은 걸리지만 정상 매칭 중에도
        #    R8(9.9)·R13(8.2)이 함께 사라진다. 임베딩 검색이 근본 해법이지만
        #    외부 API 미사용 결정과 충돌하고 1GB RAM에 부담이다.
        #
        #    **그냥 두기로 했다.** 답변 본문은 정직하게 "확실히 알지 못해요"라고
        #    말하고 창구로 보낸다. 배지 하나 때문에 검색 품질을 떨어뜨리거나
        #    인프라를 바꿀 이득이 없다. 어휘 검색으로는 의미가 다른지 알 수 없다.
        stage = EvidenceStage.CONFIRMED if (cards or found) else EvidenceStage.WEB
        yield EvidenceEvent(stage=stage.value, notice=notice_for(stage))

        # 5) 쉬운 말 안내 (스트리밍)
        context = build_guidance_context(
            triage,
            [self._as_injection(i) for lead, comps, _ in cards for i in (lead, *comps)],
            stage=stage,
            passages=[self._as_passage_injection(p) for p in found],
        )
        allow_web = stage == EvidenceStage.WEB

        try:
            async for delta in self._llm.stream_guidance(
                message=cmd.message,
                history=history,
                context=context,
                allow_web_search=allow_web,
            ):
                if delta:
                    yield TextEvent(delta=delta)
        except Exception:
            logger.warning("guidance 스트리밍 실패 (upstream)")
            yield ErrorEvent()
            return

        # 6) 카드 (텍스트 뒤에 붙는다 — 챗봇 화면의 제도 카드)
        for lead, companions, route in cards:
            yield CardEvent(card=self._to_card(lead, companions, route))

        yield DoneEvent()

    # ── helpers ──
    def _to_route_out(self, triage: TriageResult) -> tuple[RouteOut, ...]:
        return tuple(
            RouteOut(
                key=p.route.value,
                label=label_for(p.route),
                rank=i + 1,
                reason=reason_text(self._reason_for(p.route)),
            )
            for i, p in enumerate(triage.priorities)
        )

    def _pin_route(self, triage: TriageResult, route_id: str) -> TriageResult:
        """카드에서 연 대화면 그 항목을 1순위로 올린다.

        **triage를 건너뛰지 않고 순서만 바꾼다.** 사용자가 R14 카드에서 열었더라도
        "신분증은 어디서 만드나요"를 물을 수 있다. 건너뛰면 그 답을 못 하고, 순서만
        바꾸면 모델이 고른 것도 뒤에 남아 근거 검색이 둘 다 훑는다.
        """
        if not route_id:
            return triage
        try:
            pinned = RouteId(route_id)
        except ValueError:
            return triage
        rest = tuple(p for p in triage.priorities if p.route != pinned)
        return replace(
            triage, priorities=(RoutePriority(route=pinned), *rest)[:_MAX_ROUTES]
        )

    def _search_passages(
        self, message: str, triage: TriageResult, pinned: str = ""
    ) -> list[Passage]:
        """질문과 관련된 근거 구절. 검색어는 로그에 남기지 않는다.

        **카드에서 연 대화는 그 항목 문서만 본다.** "다음에 뭘 해야 하나요"처럼
        무엇에 대한 질문인지 문장만으로는 알 수 없을 때, 가중치만으로는 엉뚱한
        문서가 1순위가 된다. 실제로 R14 카드에서 연 대화에 전입신고 안내가 나갔다.
        화면이 이미 답을 알고 있으니 추측하게 두지 않는다.

        좁힌 결과가 비면 넓혀서 다시 찾는다 — 그 항목에 근거가 없다고 해서
        답할 수 있는 문서까지 사라지면 안 된다.
        """
        if self._passages is None:
            return []
        if pinned:
            only = frozenset({pinned})
            narrowed = [
                p
                for p, _ in self._passages.search(message, only)
                if pinned in p.route_ids
            ]
            if narrowed:
                return narrowed
        routes = frozenset(p.route.value for p in triage.priorities)
        return [p for p, _ in self._passages.search(message, routes)]

    def _as_passage_injection(self, passage: Passage) -> str:
        """근거 구절을 프롬프트에 넣을 형태로. 본문이 길어 앞부분만 넣는다 —
        전부 넣으면 관련 없는 대목까지 따라 들어가고 모델이 엉뚱한 곳을 인용한다.

        기관명을 함께 낸다. 지자체 자료는 특히 중요하다 — 제도 조건이 지역마다
        다른데 사용자는 그것이 자기 지역 기준이 아니라는 것을 알 방법이 없다.
        """
        who = passage.department or passage.title
        body = passage.text[:_PASSAGE_CHARS].strip()
        return f"- [{who}] {body}"

    def _reason_for(self, route: RouteId) -> ReasonCode | None:
        """왜 이 항목이 먼저인지를 데이터에서 도출한다. 대부분은 비는 것이 정상이다 —
        화면이 이미 말하고 있는 것을 문장으로 되풀이하지 않는다.
        모델에게 맡기지 않는 이유는 사용자가 말한 죄목이 이유에 실려 화면에 남기 때문이다.
        """
        if route.value in self._blocking_routes:
            return ReasonCode.BLOCKS_OTHERS
        lead = self._institutions.lead_of(route)
        if not lead.docs:
            return ReasonCode.NO_DOCUMENTS
        return None

    def _match_cards(
        self, triage: TriageResult
    ) -> list[tuple[Institution, tuple[Institution, ...], RouteId]]:
        # **항목을 골랐다는 것 자체가 지원 질문이라는 신호다.**
        #
        # 모델이 "나갈 데가 없는데 오늘 밤 어디서 자요"에 R1·R4를 정확히 고르고도
        # question_type을 daily로 낸 적이 있다. 그때 카드가 통째로 사라지고 답변까지
        # 비었다. 두 값이 어긋나면 **더 구체적인 쪽(고른 항목)을 믿는다.**
        if triage.question_type != QuestionType.SUPPORT and not triage.priorities:
            return []
        picked: list[tuple[Institution, tuple[Institution, ...], RouteId]] = []
        seen: set[str] = set()
        for p in triage.priorities:
            # 항목당 카드 1장. 신청할 곳이 둘이면 카드를 나누지 않고 옵션으로 묶는다 —
            # 카드 개수와 할 일 개수가 어긋나면 "몇 개 중 몇 개 완료"를 셀 수 없다.
            lead = self._lead_for(p)
            if lead.id in seen:
                continue
            companions = tuple(self._institutions.companions_of(p.route))
            picked.append((lead, companions, p.route))
            seen.update({lead.id, *(c.id for c in companions)})
            if len(picked) >= _MAX_CARDS:
                break
        return picked

    def _lead_for(self, priority: RoutePriority) -> Institution:
        """그 사람에게 맞는 대표 제도.

        **탭과 챗이 같은 카드를 내야 한다.** 초기 진단에서 "압류를 막아주는 통장"을
        본 사람이 챗에서 "은행 계좌 다시 만들기"를 보면 같은 서비스가 같은 사람에게
        다르게 말하는 셈이다. 갈림 규칙은 그래프의 for_state가 정본이므로(§4.1)
        초기 진단과 같은 함수에 물어본다.

        상태를 모르면(X) 그래프가 기본 경로를 주고, 그것이 없으면 항목의 대표다.
        """
        kb_ref = kb_ref_for_route(self._nodes, priority.route.value, priority.state)
        if kb_ref:
            found = self._institutions.by_id(kb_ref)
            if found is not None:
                return found
            logger.warning(
                "그래프의 kb_ref가 KB에 없다 — route=%s state=%s kb_ref=%s",
                priority.route.value,
                priority.state.value,
                kb_ref,
            )
        return self._institutions.lead_of(priority.route)

    def _as_injection(self, inst: Institution) -> str:
        docs = ", ".join(inst.docs) if inst.docs else "특별한 서류 없이 문의 가능"
        return (
            f"- {inst.name}: {inst.summary_easy} "
            f"(어디서: {inst.where} / 서류: {docs} / 다음 단계: {inst.next_step})"
        )

    def _to_option(self, inst: Institution) -> CardOption:
        desk = desk_of(inst)
        contact = contact_of(inst)
        return CardOption(
            org=inst.name,
            where=inst.where,
            next_step=inst.next_step,
            docs=inst.docs,
            desk_place=desk.place if desk else "",
            desk_say=desk.say if desk else "",
            contact_org=contact.org,
            contact_phone=contact.phone,
            contact_hours=contact.hours,
        )

    def _to_card(
        self, inst: Institution, companions: tuple[Institution, ...], route: RouteId
    ) -> CardData:
        """카드 라벨은 이 카드가 나온 항목의 이름이다. 제도가 걸친 항목을 모두 이어붙이면
        R2로 매칭된 정부 긴급복지가 "공단 긴급지원 · 생계급여"로 나와 왜 떴는지 알 수 없다."""
        return CardData(
            institution_id=inst.id,
            name=inst.name,
            route_label=label_for(route),
            summary_easy=inst.summary_easy,
            where=inst.where,
            docs=inst.docs,
            next_step=inst.next_step,
            deadline=inst.deadline,
            source_url=inst.source_url,
            benefit_summary=inst.benefit_summary,
            eligibility=inst.eligibility,
            steps=inst.steps,
            cautions=inst.cautions,
            source_urls=inst.source_urls,
            verified_note=verified_note(inst.verified_at),
            options=tuple(
                self._to_option(i) for i in (inst, *companions)
            ),
        )
