"""ChatUseCase — triage → 카드 매칭(서버) → 쉬운 말 안내(스트리밍) 오케스트레이션.

'약사 모델': 안내 텍스트는 모델이 생성하되, 제도 카드(사실)는 서버가 KB에서 매칭해 붙인다.
모델은 제도명·신청처를 지어내지 않는다.

SSE 순서 계약: triage → text(델타*) → card* → done  (오류 시 error)
대화는 서버에 저장하지 않는다(멀티턴은 클라이언트가 history로 전달, 처리 후 폐기).
"""

import logging
from collections.abc import AsyncIterator

from app.domains.chat.application.dto import (
    CardData,
    CardEvent,
    ChatCommand,
    ChatEvent,
    DoneEvent,
    ErrorEvent,
    RouteOut,
    TextEvent,
    TriageEvent,
)
from app.domains.chat.application.port import ChatLlm
from app.domains.chat.domain.prompts import build_guidance_context
from app.domains.chat.domain.triage import (
    QuestionType,
    ReasonCode,
    TriageResult,
    reason_text,
)
from app.domains.knowledge.domain.entity import Institution
from app.domains.knowledge.domain.repository import InstitutionRepository
from app.domains.shared.routes import RouteId, label_for

logger = logging.getLogger("majung.chat")

_MAX_CARDS = 3


class ChatUseCase:
    def __init__(
        self,
        llm: ChatLlm,
        institutions: InstitutionRepository,
        blocking_routes: frozenset[str] = frozenset(),
    ) -> None:
        self._llm = llm
        self._institutions = institutions
        # 다른 항목의 선행조건인 항목들. 그래프 구조에서 미리 뽑아 주입받는다 —
        # 챗이 그래프 전체를 알 필요는 없고 이 사실만 있으면 된다.
        self._blocking_routes = blocking_routes

    async def run(self, cmd: ChatCommand) -> AsyncIterator[ChatEvent]:
        history = list(cmd.history)

        # 1) triage (구조화)
        try:
            triage = await self._llm.triage(cmd.message, history)
        except Exception:
            logger.warning("triage 실패 (upstream)")  # 사용자 입력 원문은 로그에 남기지 않는다
            yield ErrorEvent()
            return

        yield TriageEvent(routes=self._to_route_out(triage))

        # 2) 카드 매칭 (서버, KB 밖 생성 금지)
        cards = self._match_cards(triage)

        # 3) 쉬운 말 안내 (스트리밍). support면 카드 사실을 주입, daily면 웹 검색 허용
        context = build_guidance_context(triage, [self._as_injection(c) for c in cards])
        allow_web = triage.question_type == QuestionType.DAILY

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

        # 4) 카드 (텍스트 뒤에 붙는다 — 챗봇 화면의 제도 카드)
        for inst in cards:
            yield CardEvent(card=self._to_card(inst))

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

    def _match_cards(self, triage: TriageResult) -> list[Institution]:
        if triage.question_type != QuestionType.SUPPORT:
            return []
        picked: list[Institution] = []
        seen: set[str] = set()
        for p in triage.priorities:
            # 항목당 대표 1개. 어느 제도가 대표인지는 KB 데이터가 정한다(lead_for).
            inst = self._institutions.lead_of(p.route)
            if inst.id not in seen:
                picked.append(inst)
                seen.add(inst.id)
            if len(picked) >= _MAX_CARDS:
                break
        return picked

    def _as_injection(self, inst: Institution) -> str:
        docs = ", ".join(inst.docs) if inst.docs else "특별한 서류 없이 문의 가능"
        return (
            f"- {inst.name}: {inst.summary_easy} "
            f"(어디서: {inst.where} / 서류: {docs} / 다음 단계: {inst.next_step})"
        )

    def _route_label(self, inst: Institution) -> str:
        """카드 상단에 보일 항목 라벨. 한 제도가 여러 항목의 근거면 모두 적는다."""
        return " · ".join(label_for(r) for r in inst.route_ids)

    def _to_card(self, inst: Institution) -> CardData:
        return CardData(
            institution_id=inst.id,
            name=inst.name,
            route_label=self._route_label(inst),
            summary_easy=inst.summary_easy,
            where=inst.where,
            docs=inst.docs,
            next_step=inst.next_step,
            deadline=inst.deadline,
            source_url=inst.source_url,
        )
