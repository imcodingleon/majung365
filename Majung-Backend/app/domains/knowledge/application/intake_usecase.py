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
from dataclasses import replace

from app.domains.knowledge.application.dto import (
    IntakeCard,
    IntakeCardOption,
    IntakeTask,
    NoticeSource,
    RouteNotice,
)
from app.domains.knowledge.application.port import TaskOrderLlm
from app.domains.knowledge.domain.contacts import contact_of, desk_of
from app.domains.knowledge.domain.entity import Institution
from app.domains.knowledge.domain.graph_engine import (
    GraphNode,
    NodeState,
    kb_ref_for_route,
    route_precedence,
)
from app.domains.knowledge.domain.intake import IntakeRule, IntakeVerdict, judge
from app.domains.knowledge.domain.legal import LegalConstraint, constraints_for
from app.domains.knowledge.domain.ordering import (
    OrderItem,
    build_order_input,
    checkable_precedence,
    fallback_order,
    reorder,
    validate_order,
)
from app.domains.knowledge.domain.purpose import (
    docs_with_purpose,
    expense_purpose,
    say_with_purpose,
)
from app.domains.knowledge.domain.repository import InstitutionRepository
from app.domains.knowledge.domain.sources import verified_note
from app.domains.shared.routes import (
    RouteId,
    label_for,
    section_label_for,
    tab_label_for,
)
from app.domains.shared.starter_questions import questions_for
from app.domains.staff.domain.entity import org_for

logger = logging.getLogger("majung.intake")


class IntakeUseCase:
    def __init__(
        self,
        institutions: InstitutionRepository,
        rules: tuple[IntakeRule, ...],
        blocking_routes: frozenset[str] = frozenset(),
        graph_nodes: dict[str, GraphNode] | None = None,
        constraints: tuple[LegalConstraint, ...] = (),
        order_llm: TaskOrderLlm | None = None,
    ) -> None:
        self._institutions = institutions
        self._rules = rules
        self._blocking_routes = blocking_routes
        # 수용 사유별 법령 제약(§9.4). 비어 있으면 안내가 붙지 않을 뿐 나머지는 그대로다 —
        # 검수 전이거나 데이터가 없는 배포본에서도 할 일 목록은 나가야 한다.
        self._constraints = constraints
        # 순서를 정하는 모델. **없으면 정해 둔 순서로 간다** — 로컬·테스트에서
        # 모델 없이 도는 것이 정상 경로다.
        self._order_llm = order_llm
        # 상태별로 대표가 갈리는 항목은 그래프가 정한다(기획서 §4.1).
        # 없으면 항목의 기본 대표를 쓴다 — 갈림이 없는 항목이 대부분이다.
        self._nodes = graph_nodes or {}
        # 순서 검사에 쓸 선행조건 쌍. 부팅 때 한 번 뽑아 둔다 —
        # 요청마다 그래프를 다시 훑을 값이 아니다.
        self._precedence = checkable_precedence(route_precedence(self._nodes))
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

        **겹침만 보면 부족하다.** `shelter` 노드가 R1·R4를 겸하는데 R4용 경로가
        따로 없어 R4가 R1과 똑같은 카드를 냈다. 그런데 두 경로 모두 노드의 항목과
        한 칸씩 겹치니 겹침 검사는 그대로 통과했다. **겸하는 항목마다 자기 경로가
        있는지**를 따로 봐야 걸린다.
        """
        broken: list[str] = []
        for node in self._nodes.values():
            covered = set(node.route_ids)
            self._check_each_route_has_a_path(node, broken)
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

    def judge_only(self, answers: dict[str, object]) -> tuple[IntakeVerdict, ...]:
        """답변을 판정까지만 한다. 카드는 만들지 않는다.

        **저장하는 것은 이 결과뿐이다** (§9.1). 답변 원문을 서버에 남기지 않으면서도
        나중에 같은 할 일 목록을 다시 만들 수 있게 하는 것이 이 판정이다.
        """
        verdicts = judge(answers, self._rules, self._blocking_routes)
        # 고른 용도를 판정에 얹는다. 답변은 저장하지 않으므로(0008) 여기서
        # 담아 두지 않으면 세션 복원 뒤에 문구가 조용히 달라진다.
        return tuple(
            replace(v, purpose=expense_purpose(v.route_id, answers) or "")
            for v in verdicts
        )

    def run(
        self,
        answers: dict[str, object],
        completed: frozenset[RouteId] = frozenset(),
    ) -> tuple[IntakeTask, ...]:
        return self.from_verdicts(self.judge_only(answers), completed)

    async def ordered_verdicts(
        self,
        verdicts: tuple[IntakeVerdict, ...],
        *,
        profile_line: str = "",
        crime_category: str | None = None,
    ) -> tuple[IntakeVerdict, ...]:
        """할 일 순서를 정한다 (2026-09-02 결정).

        **판정 목록의 순서가 곧 화면의 순서다.** 이 결과를 그대로 저장하면 복원할
        때 다시 정할 필요가 없고, 같은 사람은 몇 번을 다시 들어와도 같은 순서를
        본다 — 결정성을 모델이 아니라 저장에서 얻는다.

        그래서 **여기를 부르는 곳은 가입과 재진단 둘뿐이다.** 복원이나 완료 처리에서
        부르면 순서가 매번 흔들리고, `SSOT.md` §4.2가 걱정한 그대로가 된다.

        모델이 없거나 답이 어긋나면 정해 둔 순서로 간다.
        """
        if self._order_llm is None or not verdicts:
            return tuple(reorder(verdicts, fallback_order(verdicts)))

        items = tuple(
            OrderItem(
                route_id=v.route_id.value,
                label=label_for(v.route_id),
                state=v.state,
                has_deadline=self._has_deadline(v.route_id),
                deadline_text=self._deadline_text(v.route_id),
                notice_lines=tuple(
                    c.headline
                    for c in constraints_for(
                        self._constraints, crime_category, v.route_id.value
                    )
                ),
            )
            for v in verdicts
        )
        payload = build_order_input(
            items, profile_line=profile_line, precedence=self._precedence
        )
        proposed = await self._order_llm.order_tasks(payload)
        checked = validate_order(proposed, verdicts, self._precedence)
        if checked is None:
            # 무엇이 어긋났는지는 남기지 않는다 — 어떤 항목이 배정됐는지가 곧
            # 그 사람의 상황이다(0008 마이그레이션).
            logger.info("순서 검사를 통과하지 못해 정해 둔 순서로 낸다")
            return tuple(reorder(verdicts, fallback_order(verdicts)))
        return tuple(reorder(verdicts, checked))

    def _has_deadline(self, route: RouteId) -> bool:
        return any(
            n.deadline is not None
            for n in self._nodes.values()
            if route.value in n.route_ids
        )

    def _deadline_text(self, route: RouteId) -> str:
        for n in self._nodes.values():
            if route.value in n.route_ids and n.deadline is not None:
                return n.deadline.text
        return ""

    def from_verdicts(
        self,
        verdicts: tuple[IntakeVerdict, ...],
        completed: frozenset[RouteId] = frozenset(),
        crime_category: str | None = None,
    ) -> tuple[IntakeTask, ...]:
        """판정으로 할 일 카드를 만든다.

        **카드 본문은 여기서 새로 만들어진다.** 저장된 것은 판정뿐이라, 지식 베이스가
        갱신되면 복원된 화면도 최신 안내를 받는다 — 옛 카드가 굳어 남지 않는다.
        """
        return tuple(
            IntakeTask(
                route_id=v.route_id.value,
                route_label=label_for(v.route_id),
                tab_label=tab_label_for(v.route_id),
                section_id=v.section_id.value,
                section_label=section_label_for(v.section_id),
                blocks_others=v.blocks_others,
                # 받을 담당자가 있는 항목인지는 기관 매핑이 정본이다(§7).
                can_request_visit=org_for(v.route_id) is not None,
                card=self._card_for(v),
                starter_questions=questions_for(v.route_id),
                notices=self._notices_for(v.route_id, crime_category),
            )
            for v in verdicts
            if v.route_id not in completed
        )

    def _notices_for(
        self, route: RouteId, category: str | None
    ) -> tuple[RouteNotice, ...]:
        """그 항목에 붙는 수용 사유 안내.

        **여기가 동의 게이트다.** 죄목 저장소가 None을 주면 대부분 아무것도 만들지
        않고 화면에서 통째로 사라진다. 철회하면 다음 요청부터 즉시 그렇게 된다.

        수용 사유와 무관하게 형을 살았다는 사실 자체에 붙는 제약만 그 경우에도
        남는다(`applies_without_category`) — 경비업법 결격사유가 그 자리다.
        """
        return tuple(
            RouteNotice(
                tone=c.effect,
                headline=c.headline,
                body=c.body,
                myth=c.myth,
                what_to_do=c.what_to_do,
                sources=tuple(
                    NoticeSource(label=s.label, url=s.url) for s in c.sources if s.url
                ),
                verified_note=verified_note(c.verified_at.isoformat()),
            )
            for c in constraints_for(self._constraints, category, route.value)
        )

    def _to_option(
        self, inst: Institution, purpose: str | None = None
    ) -> IntakeCardOption:
        desk = desk_of(inst)
        contact = contact_of(inst)
        return IntakeCardOption(
            org=inst.name,
            where=inst.where,
            next_step=inst.next_step,
            docs=docs_with_purpose(inst.docs, purpose),
            desk_place=desk.place if desk else "",
            desk_say=say_with_purpose(desk.say, purpose) if desk else "",
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
        # 세 번째 값은 '역할까지 판단한 지정인가'다. 규칙표는 사람이 답변별로
        # 적은 것이라 대표로 세우려는 의도가 분명하고, 그래프는 "이 자원을 얻는
        # 방법"이라 대표·동반 역할까지 정한 것이 아니다.
        order = [
            (graph_ref, "그래프", False),
            (verdict.lead_override, "규칙표", True),
        ]
        if verdict.override_is_specific and verdict.lead_override:
            order.reverse()
        for kb_ref, origin, role_aware in order:
            if not kb_ref:
                continue
            found = self._institutions.by_id(kb_ref)
            if found is not None:
                if not role_aware and verdict.route_id in found.companion_for:
                    # **동반으로 선언된 제도는 대표가 되지 않는다.**
                    #
                    # R2의 그래프 경로가 정부 긴급복지(129)를 가리키는데 그것은
                    # R2의 동반이다. 대표 자리에 앉으면 `_card_for`가 대표와 같은
                    # id를 동반에서 빼기 때문에 **선언된 대표인 공단 긴급지원
                    # (1670-7004)이 카드에서 통째로 사라진다.** 둘 다 보여야 하는
                    # 자리라고 companion_for 주석이 적어 둔 그 항목이다.
                    #
                    # 그래프가 아는 것은 "이 자원을 얻는 방법"이고, 대표·동반
                    # 역할은 선언이 정한다. 역할까지 그래프가 뒤집게 두지 않는다.
                    logger.info(
                        "%s가 가리킨 제도는 이 항목의 동반이다 — 대표는 선언을 따른다"
                        " (route=%s kb_ref=%s)",
                        origin,
                        verdict.route_id.value,
                        kb_ref,
                    )
                    continue
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

    def _check_each_route_has_a_path(
        self, node: GraphNode, broken: list[str]
    ) -> None:
        """항목을 겸하는 노드에서, 어느 항목이 자기 경로를 못 가지는지 본다.

        경로에 `route_ids`를 안 적으면 노드의 모든 항목에 해당하므로, 그런 경로가
        하나라도 있으면 전부 덮인 것으로 본다 — 겸하지 않는 노드에 일일이 적게
        하면 데이터만 늘고 틀릴 자리가 생긴다.
        """
        routes = set(node.route_ids)
        if len(routes) < 2:
            return
        if any(not path.route_ids for path in node.obtain):
            return
        claimed = {r for path in node.obtain for r in path.route_ids}
        orphan = sorted(routes - claimed)
        if orphan:
            broken.append(
                f"{node.id}({','.join(sorted(routes))})에 "
                f"{','.join(orphan)}용 경로가 없다 — 다른 항목의 카드가 대신 나간다"
            )

    def _card_for(self, verdict: IntakeVerdict) -> IntakeCard:
        """항목당 카드 하나. 신청할 곳이 둘이면 카드를 나누지 않고 옵션으로 묶는다 —
        카드 개수와 할 일 개수가 어긋나면 "몇 개 중 몇 개 완료"를 셀 수 없다."""
        route = verdict.route_id
        lead = self._lead_for(verdict)
        # **용도는 판정에서 꺼낸다.** 답변에서 뽑은 파생 문구라 판정과 함께
        # 저장되고, 세션을 복원해도 준비물 문구가 일반형으로 돌아가지 않는다.
        purpose = verdict.purpose or None
        # 대표가 동반 목록에 다시 들어가면 같은 곳이 두 번 보인다.
        companions = [
            i for i in self._institutions.companions_of(route) if i.id != lead.id
        ]
        paths = (lead, *companions)
        return IntakeCard(
            institution_id=lead.id,
            name=lead.name,
            summary_easy=lead.summary_easy,
            docs=docs_with_purpose(lead.docs, purpose),
            deadline=lead.deadline,
            source_url=lead.source_url,
            benefit_summary=lead.benefit_summary,
            eligibility=lead.eligibility,
            steps=lead.steps,
            cautions=lead.cautions,
            source_urls=lead.source_urls,
            verified_note=verified_note(lead.verified_at),
            options=tuple(self._to_option(i, purpose) for i in paths),
        )
