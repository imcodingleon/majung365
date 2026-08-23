"""IntakeUseCase — 초기 진단 답변 → 지원 항목별 할 일 목록.

세션도 저장도 없다(stateless). 요청 한 번에 응답 한 번으로 끝나고, 완료 처리는
프론트가 완료한 항목을 함께 보내면 그것을 빼고 다시 계산한다.

응답은 두 층으로 나뉜다(기획서 §4.1).
- **제도 원본**(IntakeCard) — 모든 사용자에게 같다
- **사용자별 판정**(blocks_others 등) — 사람마다 다르다
한 구조에 섞으면 KB가 사용자 상태를 들고 있어야 하는 모양이 되고, 저장 위치와
암호화 범위도 갈린다.
"""

import logging

from app.domains.knowledge.application.dto import IntakeCard, IntakeCardOption, IntakeTask
from app.domains.knowledge.domain.intake import IntakeRule, judge
from app.domains.knowledge.domain.repository import InstitutionRepository
from app.domains.shared.routes import (
    RouteId,
    label_for,
    section_label_for,
    tab_label_for,
)

logger = logging.getLogger("majung.intake")


class IntakeUseCase:
    def __init__(
        self,
        institutions: InstitutionRepository,
        rules: tuple[IntakeRule, ...],
        blocking_routes: frozenset[str] = frozenset(),
    ) -> None:
        self._institutions = institutions
        self._rules = rules
        self._blocking_routes = blocking_routes

    def run(
        self,
        answers: dict[str, object],
        completed: frozenset[RouteId] = frozenset(),
    ) -> tuple[IntakeTask, ...]:
        verdicts = judge(answers, self._rules, self._blocking_routes)
        return tuple(
            IntakeTask(
                route_id=v.route_id.value,
                route_label=label_for(v.route_id),
                tab_label=tab_label_for(v.route_id),
                section_id=v.section_id.value,
                section_label=section_label_for(v.section_id),
                blocks_others=v.blocks_others,
                card=self._card_for(v.route_id),
            )
            for v in verdicts
            if v.route_id not in completed
        )

    def _card_for(self, route: RouteId) -> IntakeCard:
        """항목당 카드 하나. 신청할 곳이 둘이면 카드를 나누지 않고 옵션으로 묶는다 —
        카드 개수와 할 일 개수가 어긋나면 "몇 개 중 몇 개 완료"를 셀 수 없다."""
        lead = self._institutions.lead_of(route)
        paths = (lead, *self._institutions.companions_of(route))
        return IntakeCard(
            institution_id=lead.id,
            name=lead.name,
            summary_easy=lead.summary_easy,
            docs=lead.docs,
            deadline=lead.deadline,
            source_url=lead.source_url,
            benefit_summary=lead.benefit_summary,
            eligibility=lead.eligibility,
            steps=lead.steps,
            cautions=lead.cautions,
            options=tuple(
                IntakeCardOption(
                    org=i.name, where=i.where, next_step=i.next_step, docs=i.docs
                )
                for i in paths
            ),
        )
