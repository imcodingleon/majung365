"""ChatUseCase — triage → 카드 매칭(서버) → 쉬운 말 안내(스트리밍) 오케스트레이션.

'약사 모델': 안내 텍스트는 모델이 생성하되, 제도 카드(사실)는 서버가 KB에서 매칭해 붙인다.
모델은 제도명·신청처를 지어내지 않는다.

SSE 순서 계약: triage → evidence → text(델타*) → card* → suggestions? → done  (오류 시 error)

**로그인했으면 대화를 저장한다**(§6.3). 저장은 인바운드 어댑터가 맡고 이 유스케이스는
관여하지 않는다 — 예선의 무저장 전제는 본선에서 뒤집혔다. 멀티턴 자체는 여전히
클라이언트가 history로 전달한다.
"""

import asyncio
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
    SuggestionsEvent,
    TextEvent,
    TriageEvent,
    Turn,
)
from app.domains.chat.application.port import ChatLlm
from app.domains.chat.domain.evidence import EvidenceStage, notice_for
from app.domains.chat.domain.local_branch import (
    LocalBranchAnswer,
)
from app.domains.chat.domain.local_branch import (
    answer_for as branch_answer_for,
)
from app.domains.chat.domain.local_office import LocalOfficeAnswer, answer_for
from app.domains.chat.domain.prompts import build_guidance_context
from app.domains.chat.domain.suggestions import (
    build_suggestions_context,
    normalize_suggestions,
)
from app.domains.chat.domain.triage import (
    QuestionType,
    ReasonCode,
    RoutePriority,
    TriageResult,
    reason_text,
)
from app.domains.chat.domain.user_context import (
    build_profile_block,
    build_user_context,
)
from app.domains.knowledge.domain.contacts import contact_of, desk_of
from app.domains.knowledge.domain.entity import Institution
from app.domains.knowledge.domain.graph_engine import GraphNode, kb_ref_for_route
from app.domains.knowledge.domain.legal import LegalConstraint, constraints_for
from app.domains.knowledge.domain.repository import InstitutionRepository
from app.domains.knowledge.domain.retrieval import Passage, PassageIndex
from app.domains.knowledge.domain.sources import verified_note
from app.domains.shared.routes import RouteId, label_for
from app.infrastructure.security.masking import MaskingError, assert_masked

logger = logging.getLogger("majung.chat")


def _route_or_none(route_id: str) -> RouteId | None:
    """항목 코드를 값으로. 모르는 코드면 없는 것으로 둔다."""
    if not route_id:
        return None
    try:
        return RouteId(route_id)
    except ValueError:
        return None


# 추천 질문 한 건에 걸어 두는 상한.
#
# **사용자가 화면을 보고 기다리는 자리다.** 이 호출이 끝나야 `done`이 나가고,
# 화면은 `done`을 받아야 입력 잠금을 푼다. 답변은 이미 다 그려진 뒤라 여기서
# 늘어지면 "다 나왔는데 왜 못 보내지"가 된다. 요약(45초)과 달리 짧게 잡는다.
_SUGGEST_TIMEOUT_SECONDS = 7

_MAX_CARDS = 3
# 카드에서 연 대화라도 항목을 무한정 늘리지 않는다.
_MAX_ROUTES = 3
# 근거 구절에서 프롬프트로 넘길 길이. 문서당 평균 2,300자라 전부 넣으면
# 세 구절만으로 7천 자가 되고, 관련 없는 대목이 답변에 섞인다.
_PASSAGE_CHARS = 700


# 공단 기관 종류. **정신건강복지센터는 넣지 않는다** — "공단 어디야"에 246곳짜리
# 지역 센터가 섞이면 정작 지부가 묻힌다. 허그센터는 공단 소속이라 함께 둔다.
_KOREHA_KINDS = frozenset({"branch", "head", "training", "hug"})


class ChatUseCase:
    def __init__(
        self,
        llm: ChatLlm,
        institutions: InstitutionRepository,
        blocking_routes: frozenset[str] = frozenset(),
        passages: PassageIndex | None = None,
        graph_nodes: dict[str, GraphNode] | None = None,
        district_offices: object | None = None,
        support_institutions: object | None = None,
        constraints: tuple[LegalConstraint, ...] = (),
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
        # 사용자가 자기 입으로 동을 말하면 그 주민센터를 짚어준다(§5.4).
        self._offices = district_offices
        # 공단 지부·교육원·허그센터. **제도 KB(`institutions`)와 다른 저장소다** —
        # 저쪽은 "무슨 제도가 있나"이고 이쪽은 "어디로 가면 되나"다.
        self._support = support_institutions
        # 수용 사유별 법령 제약(§9.4). **검수된 문장만 온다** — 로더가 미검수 항목을
        # 버린다. 이것을 주지 않고 수용 사유만 알리면 모델이 제약을 상상해서 말한다.
        self._constraints = constraints

    def _profile_block(self, cmd: ChatCommand) -> str:
        """프로필 블록을 만들고 **여기서만 마스킹 검사를 건다.**

        안내 컨텍스트 전체에 `assert_masked`를 걸면 안 된다 — 서버가 KB에서 붙이는
        기관 유선번호에 걸려 `MaskingError`가 나고, fail-closed라 정상 안내가 통째로
        막힌다(`masking.py` 머리말이 그 구분을 적어 두었다).

        이 블록은 열거값과 상수로만 조립하므로 통과가 당연한데, 그게 요점이다.
        **새 코드 경로가 마스킹을 건너뛴 경우**를 잡는 그물이다. 실패하면 블록을
        빼고 답한다 — 프로필 없이 답하는 것이 이미 정상 경로라 대화를 끊을 이유가 없다.
        """
        block = build_profile_block(cmd.profile)
        if not block:
            return ""
        try:
            assert_masked(block)
        except MaskingError:
            logger.warning("프로필 블록이 마스킹 검사를 통과하지 못해 빼고 답한다")
            return ""
        return block

    def _constraint_lines(
        self, cmd: ChatCommand, pinned: RouteId | None
    ) -> list[str]:
        """지금 보고 있는 항목에 걸리는 제약의 요약.

        **지금 보고 있는 항목만 낸다.** 항목 열넷의 제약을 다 실으면 그 자체가
        취약성 목록이 되고, 모델이 묻지도 않은 제약을 꺼낸다.
        """
        if pinned is None or cmd.profile is None:
            return []
        return [
            f"- {c.headline}: {c.body}"
            for c in constraints_for(
                self._constraints, cmd.profile.crime_category, pinned.value
            )
        ]

    async def run(self, cmd: ChatCommand) -> AsyncIterator[ChatEvent]:
        history = list(cmd.history)

        # 1) triage (구조화)
        #
        # **어느 방에서 묻는지 함께 알려준다** (2026-08-31 실사용 결함). 저리터러시
        # 사용자는 짧게 묻는데, 방을 모르면 모델이 그 말만 보고 엉뚱한 항목을 고른다.
        # R13 방의 "잃어버렸는데 어떡해요?"에 신분증(R9)이 나왔고, 아래 `_pin_route`는
        # 순서만 바꾸므로 그 R9가 끝까지 남아 곁가지 자료의 출처가 됐다.
        pinned_label = label_for(RouteId(cmd.route_id)) if _route_or_none(cmd.route_id) else ""
        try:
            triage = await self._llm.triage(
                cmd.message, history, name=cmd.user_name, route_label=pinned_label
            )
        except Exception:
            logger.warning("triage 실패 (upstream)")  # 사용자 입력 원문은 로그에 남기지 않는다
            yield ErrorEvent()
            return

        # **카드에서 연 대화면 그 항목을 앞에 세운다**(§6.1). 사용자가 R14 카드를
        # 보다가 "다음에 뭘 해야 하나요"라고 물으면, 그 문장만으로는 무슨 얘기인지
        # 알 수 없다. 화면이 이미 답을 알고 있으니 모델이 다시 맞힐 이유가 없다.
        triage = self._pin_route(triage, cmd.route_id)
        # 라우터가 모르는 코드를 이미 버렸지만, 값으로 다루는 자리는 한 번 더 본다 —
        # 여기서 예외가 나면 대화 전체가 끊긴다.
        pinned_route = _route_or_none(cmd.route_id)

        yield TriageEvent(routes=self._to_route_out(triage))

        # 2) 카드 매칭 (서버, KB 밖 생성 금지)
        cards = self._match_cards(triage, cmd.route_id)

        # 3) 근거 문서 검색. 카드가 제도의 요약이라면 이쪽은 본문이라,
        #    "기한이 며칠인가요" 같은 구체적인 질문에 답할 수 있는 것은 이쪽이다.
        found, other_found = self._search_passages(cmd.message, triage, cmd.route_id)

        # 3.5) 사용자가 동을 말했으면 그 주민센터를 찾는다.
        #      **있는 데이터를 없다고 말하면 안 된다** — "오금동 주민센터"를 물었는데
        #      "인터넷에서 찾아보세요"라고 답한 적이 있다. 그 순간 서버에 답이 있었다.
        local = self._local_office(triage)
        if local.found:
            found = [*found, self._as_local_passage(local)]

        # 3.6) 공단 기관도 같은 이유로 짚어준다.
        #      **주민센터에서 고친 결함이 공단 지부에서 그대로 되풀이됐다.**
        #      "군포역 근처 법무보호복지공단 어디야?"에 "검색이 잘 안 되네요, 홈페이지에서
        #      찾아보세요"가 나갔다. 그 순간 서버에 경기지부 주소와 번호가 있었다.
        branch = self._local_branch(triage)
        if branch.found:
            found = [*found, self._as_branch_passage(branch)]

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
        #    **판정 로직은 그냥 두기로 했다.** 답변 본문은 정직하게 "확실히 알지
        #    못해요"라고 말하고 창구로 보낸다. 배지 하나 때문에 검색 품질을
        #    떨어뜨리거나 인프라를 바꿀 이득이 없다. 어휘 검색으로는 의미가
        #    다른지 알 수 없다.
        #
        #    **대신 화면 문구를 약하게 했다**(08 세션 제안). 셋 다 검색을 고치는
        #    쪽이었는데 넷째 길이 있었다 — 주장의 강도를 낮추는 것이다.
        #
        #      "확인된 자료예요"        이 답이 그 자료에 근거한다는 주장
        #      "확인된 자료를 참고했어요"  주장이 약해 어긋나도 거짓이 아니다
        #
        #    서버는 confirmed에 문구를 보내지 않는다(notice_for가 빈 문자열).
        #    화면이 stage를 받아 만들므로 프론트 쪽 변경이다. **웹 단계 문구는
        #    그대로 둔다** — 둘 다 눅이면 §6.4가 두 단계를 눈으로 구별시키려던
        #    설계가 무너진다.
        # **판정을 모델에게 넘겼다 (2026-08-24).** 위 기록은 그대로 두되 결론이
        # 바뀌었다 — 넷째 길(문구 약화)로는 본문의 회피를 막지 못했다.
        #
        # 실사용에서 "군포역 근처 법무보호복지공단 어디야?"에 회피가 나갔다.
        # 배지는 confirmed였다. 배포 서버에서 재현해 보니 이랬다.
        #
        #   "생계급여 기준 중위소득"  →  '생계급여' 문서가 걸림.  2026년 수치 없음
        #   "군포역 근처 공단"        →  '공단' 문서가 걸림.      지부 위치 없음
        #   "서울 날씨"              →  아무것도 안 걸림       →  web
        #
        # **제도 이름이 든 질문은 반드시 뭔가 걸린다.** 그래서 이 서비스의 본
        # 영역에서는 웹 검색이 사실상 절대 안 됐고, 정작 웹이 필요 없는 무관한
        # 질문에서만 열렸다. 완전히 뒤집혀 있었다.
        #
        # 코드는 문서에 답이 들어 있는지 알 수 없다 — 읽어야 아는 것이다.
        # 검색 도구는 모델이 필요할 때 부르는 것인데 코드가 미리 뺏고 있었다.
        # 이제 근거와 도구를 함께 주고, 부족하면 모델이 검색한다.
        has_evidence = bool(cards or found or other_found)
        context = build_guidance_context(
            triage,
            [self._as_injection(i) for lead, comps, _ in cards for i in (lead, *comps)],
            stage=EvidenceStage.CONFIRMED if has_evidence else EvidenceStage.WEB,
            passages=[self._as_passage_injection(p) for p in found],
            pinned=pinned_route,
            other_passages=[self._as_passage_injection(p) for p in other_found],
            # 진단 판정과 프로필. **없는 것이 정상 경로다** — 가입 전에도 챗을 열 수 있다.
            user_context=build_user_context(
                cmd.intake, pinned_route, self._profile_block(cmd)
            ),
            constraint_lines=self._constraint_lines(cmd, pinned_route),
        )

        # **배지는 실제로 검색했는지로 정한다.** 추측이 아니라 사실이다.
        # 첫 텍스트가 나오기 전에 한 번만 내보내므로 §6.4의 "먼저 알린다"가 지켜진다.
        evidence_sent = False
        # **답변 본문을 여기서도 모은다.** 라우터가 저장용으로 따로 모으고 있지만,
        # 이어서 물을 것을 정하려면 무슨 답을 했는지 이 유스케이스가 알아야 한다.
        answer: list[str] = []

        try:
            async for chunk in self._llm.stream_guidance(
                message=cmd.message,
                history=history,
                context=context,
                allow_web_search=True,
                name=cmd.user_name,
            ):
                if chunk.web_search_started and not evidence_sent:
                    evidence_sent = True
                    yield EvidenceEvent(
                        stage=EvidenceStage.WEB.value,
                        notice=notice_for(EvidenceStage.WEB),
                    )
                if chunk.text:
                    if not evidence_sent:
                        # 검색하지 않고 답을 쓰기 시작했다 — 가진 자료로 답한다는 뜻이다.
                        evidence_sent = True
                        if has_evidence:
                            yield EvidenceEvent(
                                stage=EvidenceStage.CONFIRMED.value,
                                notice=notice_for(EvidenceStage.CONFIRMED),
                            )
                        # 근거도 없고 검색도 안 했으면 배지를 붙이지 않는다.
                        # 없는 근거를 "확인한 자료"라고 말하는 것이 가장 나쁘다.
                    answer.append(chunk.text)
                    yield TextEvent(delta=chunk.text)
        except Exception:
            logger.warning("guidance 스트리밍 실패 (upstream)")
            yield ErrorEvent()
            return

        # 6) 카드 (텍스트 뒤에 붙는다 — 챗봇 화면의 제도 카드)
        for lead, companions, route in cards:
            yield CardEvent(card=self._to_card(lead, companions, route))

        # 7) 이어서 물어볼 만한 질문 (§6.1). **답변이 다 흐른 뒤라야 정해진다.**
        questions = await self._suggest(cmd, history, "".join(answer))
        if questions:
            yield SuggestionsEvent(questions=questions)

        yield DoneEvent()

    async def _suggest(
        self, cmd: ChatCommand, history: list[Turn], answer: str
    ) -> tuple[str, ...]:
        """이어서 물어볼 만한 질문 셋. **못 만들면 빈 튜플이고 이벤트가 안 나간다.**

        **여기서 늦어지면 사용자가 기다린다.** 화면은 `done`을 받아야 입력 잠금을
        푸는데(`useTaskThreads`의 busy), 답변은 이미 다 그려진 뒤다. 점 세 개가
        계속 돌고 보내기가 막힌 채로 있으면 "다 나왔는데 왜 못 보내지"가 된다.
        그래서 상한을 짧게 걸고, 넘으면 제안 없이 끝낸다.

        **실패가 답변을 무르게 하지 않는다.** 본문과 카드는 이미 나갔으므로
        여기서 예외를 올릴 이유가 없다. 프롬프트와 원문은 로그에 남기지 않는다.
        """
        if not answer.strip():
            # 답이 비었으면 이어서 물을 것도 정할 수 없다. 호출 한 번을 아낀다.
            return ()
        turns = [*history, Turn(role="assistant", content=answer)]
        context = build_suggestions_context([label_for(r) for r in RouteId])
        try:
            raw = await asyncio.wait_for(
                self._llm.suggest_questions(turns, context=context, name=cmd.user_name),
                timeout=_SUGGEST_TIMEOUT_SECONDS,
            )
        except Exception:
            logger.warning("추천 질문 생성 실패 — 제안 없이 끝낸다")
            return ()
        return normalize_suggestions(list(raw))

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
        # **모델이 판정한 상태를 지키고 자리만 앞으로 옮긴다.**
        #
        # 여기서 RoutePriority(route=pinned)를 새로 만들면 state가 기본값으로
        # 되돌아간다. R10 카드에서 "통장이 압류돼서 못 써요"라고 하면 triage는
        # BLOCKED을 내는데 핀이 그것을 X로 덮어써서 "계좌를 새로 만드세요" 계열
        # 대표가 나갔다 — RoutePriority에 state를 둔 이유가 바로 그 시나리오다.
        found = next((p for p in triage.priorities if p.route == pinned), None)
        head = found if found is not None else RoutePriority(route=pinned)
        rest = tuple(p for p in triage.priorities if p.route != pinned)
        return replace(triage, priorities=(head, *rest)[:_MAX_ROUTES])

    def _local_office(self, triage: TriageResult) -> LocalOfficeAnswer:
        """사용자가 말한 동의 주민센터. 말하지 않았으면 찾지 않는다."""
        if self._offices is None or not triage.region.has_dong:
            return LocalOfficeAnswer(injection="")
        by_dong = getattr(self._offices, "by_dong", None)
        if not callable(by_dong):
            return LocalOfficeAnswer(injection="")
        try:
            found = by_dong(
                triage.region.dong,
                triage.region.sido or None,
                triage.region.sigungu or None,
            )
        except Exception:
            # 조회 실패가 답변 자체를 막지는 않는다. 검색어는 로그에 남기지 않는다.
            logger.warning("주민센터 조회 실패")
            return LocalOfficeAnswer(injection="")
        return answer_for(triage.region.dong, list(found))

    def _local_branch(self, triage: TriageResult) -> LocalBranchAnswer:
        """사용자 지역의 공단 기관. **조회 실패가 답변을 막지는 않는다.**"""
        region = triage.region
        if self._support is None or not (region.sido or region.sigungu):
            return LocalBranchAnswer(injection="")
        find = getattr(self._support, "find", None)
        if not callable(find):
            return LocalBranchAnswer(injection="")
        try:
            found = find(_KOREHA_KINDS, region.sido or None, region.sigungu or None)
        except Exception:
            # 검색어는 로그에 남기지 않는다.
            logger.warning("공단 기관 조회 실패")
            return LocalBranchAnswer(injection="")
        return branch_answer_for(
            region.sido,
            region.sigungu,
            list(found),
            origin=self._origin(triage),
        )

    def _origin(self, triage: TriageResult) -> tuple[float, float] | None:
        """거리를 재는 기준점. **사용자가 말한 동네의 주민센터 좌표다.**

        우리는 사용자 좌표를 받지 않는다(§5.4). 그래서 "가까운 공단"을 셀 기준점이
        없었고, 군포 사람에게 화성 지부가 수원 지부보다 먼저 나왔다.

        주민센터는 동마다 있어 그 동네의 중심으로 삼을 만하다. **좌표가 우리 서버
        밖으로 나가지 않는다** — 사용자가 말한 행정구역 이름에서 유도한 값이다.
        """
        if self._offices is None:
            return None
        region = triage.region
        by_sigungu = getattr(self._offices, "by_sigungu", None)
        if not callable(by_sigungu) or not region.sigungu:
            return None
        try:
            offices = list(by_sigungu(region.sigungu, region.sido or None))
        except Exception:
            logger.warning("기준점 조회 실패")
            return None

        # 동까지 말했으면 그 동을 쓴다. 아니면 시군구 안 아무 곳이나 — 같은 시군구
        # 안에서는 어느 동을 잡아도 시도 단위 거리 비교에 영향이 없다.
        named = [o for o in offices if region.dong and o.dong == region.dong]
        for office in [*named, *offices]:
            if office.lat is not None and office.lng is not None:
                return (office.lat, office.lng)
        return None

    def _as_branch_passage(self, branch: LocalBranchAnswer) -> Passage:
        """공단 기관 안내를 근거 구절 형태로.

        **확인 날짜를 붙인다.** 주민센터와 달리 이 표는 사람이 손으로 확인한 것이라
        (§6.4 · `route-contacts.md`) 언제 확인했는지가 의미를 갖는다.
        """
        return Passage(
            doc_id="koreha-branch",
            title="공단 기관 안내",
            section="한국법무보호복지공단 지부·지소",
            text=branch.injection,
            source_url="https://www.koreha.or.kr",
            fetched_at="",
            route_ids=(),
            department="한국법무보호복지공단",
        )

    def _as_local_passage(self, local: LocalOfficeAnswer) -> Passage:
        """주민센터 안내를 근거 구절 형태로. 확인 날짜는 붙이지 않는다 —
        행정안전부 원본을 그대로 옮긴 것이고 우리가 따로 확인한 값이 아니다."""
        return Passage(
            doc_id="district-office",
            title="주민센터 안내",
            section="행정안전부 읍면동 현황",
            text=local.injection,
            source_url="",
            fetched_at="",
            route_ids=(),
            department="행정안전부",
        )

    def _search_passages(
        self, message: str, triage: TriageResult, pinned: str = ""
    ) -> tuple[list[Passage], list[Passage]]:
        """질문과 관련된 근거 구절. 검색어는 로그에 남기지 않는다.

        **카드에서 연 대화는 그 항목 문서를 먼저 본다.** "다음에 뭘 해야 하나요"처럼
        무엇에 대한 질문인지 문장만으로는 알 수 없을 때, 가중치만으로는 엉뚱한
        문서가 1순위가 된다. 실제로 R14 카드에서 연 대화에 전입신고 안내가 나갔다.
        화면이 이미 답을 알고 있으니 추측하게 두지 않는다.

        좁힌 결과가 비면 넓혀서 다시 찾는다 — 그 항목에 근거가 없다고 해서
        답할 수 있는 문서까지 사라지면 안 된다. R13처럼 수집된 문서가 세 건뿐인
        항목에서 자주 빈다.

        **다만 넓혀서 얻은 것을 갈라서 돌려준다.** 한 덩어리로 주면 곁가지 자료가
        본 주제의 근거인 것처럼 프롬프트에 실리고, 모델이 그쪽으로 답을 옮긴다.
        돌려주는 것은 (그 항목 구절, 넓혀서 찾은 구절)이다.
        """
        if self._passages is None:
            return [], []
        if pinned:
            only = frozenset({pinned})
            narrowed = [
                p
                for p, _ in self._passages.search(message, only)
                if pinned in p.route_ids
            ]
            if narrowed:
                return narrowed, []
            routes = frozenset(p.route.value for p in triage.priorities)
            return [], [p for p, _ in self._passages.search(message, routes)]
        routes = frozenset(p.route.value for p in triage.priorities)
        return [p for p, _ in self._passages.search(message, routes)], []

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
        self, triage: TriageResult, pinned: str = ""
    ) -> list[tuple[Institution, tuple[Institution, ...], RouteId]]:
        """화면에 낼 제도 카드.

        **탭에서 연 대화는 그 항목의 카드만 낸다.** `_pin_route`는 순서만 바꾸고
        다른 항목을 지우지 않으므로, 여기서 거르지 않으면 triage가 곁들여 고른
        항목의 카드까지 함께 나간다 — 수용·출소증명서 대화에 "긴급복지 주거지원"과
        "주민등록증 재발급" 카드가 끼어든 것이 그 경로다.

        **곁가지 이야기를 막는 것이 아니다.** 본문은 여전히 답한다(§6.4 프롬프트).
        카드는 "이 할 일은 이렇게 하시면 됩니다"라는 확정된 안내라, 지금 보고 있는
        할 일이 아닌 것에 붙으면 사용자가 무엇을 하라는 말인지 알 수 없다.
        """
        # **항목을 골랐다는 것 자체가 지원 질문이라는 신호다.**
        #
        # 모델이 "나갈 데가 없는데 오늘 밤 어디서 자요"에 R1·R4를 정확히 고르고도
        # question_type을 daily로 낸 적이 있다. 그때 카드가 통째로 사라지고 답변까지
        # 비었다. 두 값이 어긋나면 **더 구체적인 쪽(고른 항목)을 믿는다.**
        if triage.question_type != QuestionType.SUPPORT and not triage.priorities:
            return []
        wanted = triage.priorities
        if pinned:
            # 핀이 붙은 항목 하나만. `_pin_route`가 이미 맨 앞에 세워 두었지만
            # 순서에 기대지 않고 값으로 찾는다 — 핀이 triage에 없던 항목이면
            # `_pin_route`가 기본 상태로 새로 만들어 넣었고, 그것도 이 항목이다.
            wanted = tuple(p for p in triage.priorities if p.route.value == pinned)
        picked: list[tuple[Institution, tuple[Institution, ...], RouteId]] = []
        seen: set[str] = set()
        for p in wanted:
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
        """제도의 사실을 프롬프트에 넣을 형태로.

        **라벨로 넣으면 모델이 그 라벨을 베껴 쓴다.** 예전에는 이 함수가
        `(어디서: … / 서류: … / 다음 단계: …)`를 만들었고, 답변마다 같은 머리말이
        같은 순서로 나왔다. 시스템 프롬프트에는 그런 서식 지시가 없었으므로
        모델은 주어진 자료의 모양을 따라 한 것이다.

        **값은 그대로 KB의 것이다.** 바꾼 것은 형식뿐이며 환각 방어는 그대로다.
        """
        parts = [f"{inst.name} — {inst.summary_easy}"]
        if inst.where:
            parts.append(f"신청은 {inst.where}에서 받습니다.")
        parts.append(
            f"챙길 것은 {', '.join(inst.docs)}입니다."
            if inst.docs
            else "따로 챙길 서류는 없고 가서 문의하면 됩니다."
        )
        if inst.next_step:
            parts.append(inst.next_step)
        return "- " + " ".join(parts)

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
