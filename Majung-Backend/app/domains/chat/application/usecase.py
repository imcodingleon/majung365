"""ChatUseCase — triage → 카드 매칭(서버) → 쉬운 말 안내(스트리밍) 오케스트레이션.

'약사 모델': 안내 텍스트는 모델이 생성하되, 제도 카드(사실)는 서버가 KB에서 매칭해 붙인다.
모델은 제도명·신청처를 지어내지 않는다.

SSE 순서 계약: triage → text(델타*) → card* → done  (오류 시 error)
대화는 서버에 저장하지 않는다(멀티턴은 클라이언트가 history로 전달, 처리 후 폐기).
"""

import logging
from collections.abc import AsyncIterator

from app.domains.chat.application.dto import (
    AreaOut,
    CardData,
    CardEvent,
    ChatCommand,
    ChatEvent,
    DoneEvent,
    ErrorEvent,
    TextEvent,
    TriageEvent,
)
from app.domains.chat.application.port import ChatLlm
from app.domains.chat.domain.prompts import build_guidance_context
from app.domains.chat.domain.triage import QuestionType, TriageResult
from app.domains.knowledge.domain.entity import Institution
from app.domains.knowledge.domain.repository import InstitutionRepository
from app.domains.shared.areas import label_for

logger = logging.getLogger("majung.chat")

_MAX_CARDS = 3


class ChatUseCase:
    def __init__(self, llm: ChatLlm, institutions: InstitutionRepository) -> None:
        self._llm = llm
        self._institutions = institutions

    async def run(self, cmd: ChatCommand) -> AsyncIterator[ChatEvent]:
        history = list(cmd.history)

        # 1) triage (구조화)
        try:
            triage = await self._llm.triage(cmd.message, history)
        except Exception:
            logger.warning("triage 실패 (upstream)")  # 사용자 입력 원문은 로그에 남기지 않는다
            yield ErrorEvent()
            return

        yield TriageEvent(areas=self._to_area_out(triage))

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
    def _to_area_out(self, triage: TriageResult) -> tuple[AreaOut, ...]:
        return tuple(
            AreaOut(key=p.area.value, label=label_for(p.area), rank=i + 1, reason=p.reason)
            for i, p in enumerate(triage.priorities)
        )

    def _match_cards(self, triage: TriageResult) -> list[Institution]:
        if triage.question_type != QuestionType.SUPPORT:
            return []
        picked: list[Institution] = []
        seen: set[str] = set()
        for p in triage.priorities:
            for inst in self._institutions.by_area(p.area):
                if inst.id in seen:
                    continue
                picked.append(inst)
                seen.add(inst.id)
                break  # 영역당 1개 (급한 영역 우선)
            if len(picked) >= _MAX_CARDS:
                break
        return picked

    def _as_injection(self, inst: Institution) -> str:
        docs = ", ".join(inst.docs) if inst.docs else "특별한 서류 없이 문의 가능"
        return (
            f"- {inst.name}: {inst.summary_easy} "
            f"(어디서: {inst.where} / 서류: {docs} / 다음 단계: {inst.next_step})"
        )

    def _to_card(self, inst: Institution) -> CardData:
        return CardData(
            institution_id=inst.id,
            name=inst.name,
            area_label=label_for(inst.area),
            summary_easy=inst.summary_easy,
            where=inst.where,
            docs=inst.docs,
            next_step=inst.next_step,
            deadline=inst.deadline,
            source_url=inst.source_url,
        )
