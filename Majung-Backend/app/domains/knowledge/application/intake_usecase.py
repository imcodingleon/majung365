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
from app.domains.knowledge.domain.contacts import contact_of, desk_of
from app.domains.knowledge.domain.entity import Institution
from app.domains.knowledge.domain.graph_engine import (
    GraphNode,
    NodeState,
    kb_ref_for_route,
)
from app.domains.knowledge.domain.intake import IntakeRule, IntakeVerdict, judge
from app.domains.knowledge.domain.repository import InstitutionRepository
from app.domains.knowledge.domain.sources import verified_note
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
        graph_nodes: dict[str, GraphNode] | None = None,
    ) -> None:
        self._institutions = institutions
        self._rules = rules
        self._blocking_routes = blocking_routes
        # 상태별로 대표가 갈리는 항목은 그래프가 정한다(기획서 §4.1).
        # 없으면 항목의 기본 대표를 쓴다 — 갈림이 없는 항목이 대부분이다.
        self._nodes = graph_nodes or {}
        self._validate_overrides()
        self._validate_graph_refs()

    def _validate_overrides(self) -> None:
        """규칙표가 가리키는 제도가 KB에 있는지 부팅 때 확인한다.

        **배포 뒤에 알면 늦다.** 없는 id를 가리키면 그 답을 고른 사람에게만 기본
        대표가 나가고, 아무도 그 화면을 보지 않으면 어긋난 채로 남는다.

        옵션 id 자체가 문항 정의와 맞는지는 여기서 확인할 수 없다 — 문항 정의는
        프론트가 들고 있고 서버에는 없다. 그쪽은 계약 문서로 맞춰야 한다.
        """
        broken = [
            f"{rule.route_id.value}.{option}→{kb_ref}"
            for rule in self._rules
            for option, kb_ref in rule.lead_by_option.items()
            if self._institutions.by_id(kb_ref) is None
        ]
        if broken:
            raise ValueError(f"규칙표가 KB에 없는 제도를 가리킨다: {broken}")

    def _validate_graph_refs(self) -> None:
        """그래프가 가리키는 제도가 **그 항목의 제도인지** 확인한다.

        **존재하는지만 보면 부족하다.** `id_card` 노드(R9)가 주민등록 재등록을
        가리킨 적이 있는데, 그 제도가 R11로 옮겨간 뒤에도 노드는 그대로였다.
        id는 KB에 살아 있으니 존재 검사는 통과하고, 신분증을 물은 사람에게 다른
        절차가 안내됐다. 카드를 옮길 때 그래프를 함께 고치지 않으면 생기는 일이다.

        **그래프가 대표를 이기는 구조라 이 어긋남은 조용히 새 카드를 덮어쓴다.**
        """
        broken: list[str] = []
        for node in self._nodes.values():
            covered = set(node.route_ids)
            for path in node.obtain:
                found = self._institutions.by_id(path.kb_ref)
                if found is None:
                    broken.append(f"{node.id}→{path.kb_ref}(KB에 없음)")
                elif not covered & {r.value for r in found.route_ids}:
                    broken.append(
                        f"{node.id}({','.join(covered)})→{path.kb_ref}"
                        f"({','.join(r.value for r in found.route_ids)})"
                    )
        if broken:
            raise ValueError(f"그래프가 다른 항목의 제도를 가리킨다: {broken}")

    def reachable_kb_refs(self) -> frozenset[str]:
        """초기 진단 화면에 실제로 나갈 수 있는 제도들.

        **"그래프 어딘가가 가리킨다"와 "화면에 도달한다"는 다르다.** `debt-legal-aid`가
        그 예였다 — 그래프의 `legal_aid` 노드가 가리키지만 R14에 노드가 둘이라
        `kb_ref_for_route`가 물러나고, 결국 화면에는 기본 대표만 나갔다.

        그래서 가리키는 곳을 세지 않고 **상태 넷을 실제로 돌려 본다.** 넷뿐이라
        전부 시도해도 부담이 없고, 판정 경로를 그대로 지나므로 결과가 정확하다.
        """
        found: set[str] = set()
        for rule in self._rules:
            for state in NodeState:
                ref = kb_ref_for_route(self._nodes, rule.route_id.value, state)
                if ref:
                    found.add(ref)
            found.update(rule.lead_by_option.values())
        return frozenset(found)

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
                card=self._card_for(v),
            )
            for v in verdicts
            if v.route_id not in completed
        )

    def _to_option(self, inst: Institution) -> IntakeCardOption:
        desk = desk_of(inst)
        contact = contact_of(inst)
        return IntakeCardOption(
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

    def _lead_for(self, verdict: IntakeVerdict) -> Institution:
        """그 사람에게 맞는 대표 제도.

        **답에 따라 대표가 갈리는 항목이 있다.** "통장은 있지만 쓰기 어려워요"를 고른
        사람에게 "계좌를 새로 만드세요"가 나가면 첫 화면부터 틀린 것을 읽는다.
        그 갈림은 그래프의 `for_state`가 정본이므로 여기서 물어본다.

        그래프에 답이 없으면(노드가 없거나 갈림이 없으면) 규칙표가 답변별로 지정한
        제도를 본다. 진행 단계처럼 4값에 담기지 않는 갈림이 그 자리다. 둘 다 없으면
        항목의 기본 대표를 쓴다.

        **순서는 아는 것이 많은 쪽이 먼저다.** 규칙표가 꼬리질문까지 보고 내린
        판정은 그래프를 앞선다 — 그래프는 "막혔다"까지만 알고 왜 막혔는지는
        꼬리질문만 안다. 그 밖에는 그래프가 먼저다.
        """
        graph_ref = kb_ref_for_route(self._nodes, verdict.route_id.value, verdict.state)
        order = [(graph_ref, "그래프"), (verdict.lead_override, "규칙표")]
        if verdict.override_is_specific and verdict.lead_override:
            order.reverse()
        for kb_ref, origin in order:
            if not kb_ref:
                continue
            found = self._institutions.by_id(kb_ref)
            if found is not None:
                return found
            # 가리킨 제도가 KB에 없다. 데이터가 어긋난 것이라 조용히 넘기지 않는다 —
            # 기본 대표로 답하되 무엇이 어긋났는지 남긴다.
            logger.warning(
                "%s의 kb_ref가 KB에 없다 — route=%s state=%s kb_ref=%s",
                origin,
                verdict.route_id.value,
                verdict.state.value,
                kb_ref,
            )
        return self._institutions.lead_of(verdict.route_id)

    def _card_for(self, verdict: IntakeVerdict) -> IntakeCard:
        """항목당 카드 하나. 신청할 곳이 둘이면 카드를 나누지 않고 옵션으로 묶는다 —
        카드 개수와 할 일 개수가 어긋나면 "몇 개 중 몇 개 완료"를 셀 수 없다."""
        route = verdict.route_id
        lead = self._lead_for(verdict)
        # 대표가 동반 목록에 다시 들어가면 같은 곳이 두 번 보인다.
        companions = [
            i for i in self._institutions.companions_of(route) if i.id != lead.id
        ]
        paths = (lead, *companions)
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
            source_urls=lead.source_urls,
            verified_note=verified_note(lead.verified_at),
            options=tuple(
                self._to_option(i) for i in paths
            ),
        )
