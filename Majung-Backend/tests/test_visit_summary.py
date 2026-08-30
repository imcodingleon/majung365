"""담당자가 먼저 읽는 요약 — 기획서 §7.4.

여기서 가장 중요한 것은 **요약이 실패해도 방문 요청이 멀쩡해야 한다**는 것이다.
요약은 담당자의 첫 번째 읽기를 덜어 주는 곁들임이지 답변을 갈음하는 것이 아니라서,
못 만들었을 때 담당자가 볼 것이 사라지면 개선이 아니라 후퇴가 된다.

두 번째는 마스킹이다. 답변은 선택지에서 고른 문장이 대부분이지만 자유 입력이 섞이는
문항이 있고, 그것이 그대로 모델로 나가면 §9.3이 막으려던 일이 벌어진다.
"""

import asyncio
import json
from dataclasses import replace
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID, uuid4

from app.domains.chat.adapter.outbound.external.claude_client import ClaudeChatLlm
from app.domains.chat.adapter.outbound.external.mock_client import MockChatLlm
from app.domains.staff.domain.entity import OrgKind
from app.domains.visit.adapter.inbound.api.router import _queue_summary
from app.domains.visit.application.summary_usecase import VisitSummaryUseCase
from app.domains.visit.domain.entity import (
    SharedAnswer,
    SummaryStatus,
    VisitRequest,
    VisitStatus,
)
from app.domains.visit.domain.summary import (
    MAX_POINTS,
    MAX_PREPARE,
    SUMMARY_INSTRUCTION,
    SUMMARY_SCHEMA,
    build_summary_input,
    normalize_summary,
)

NOW = datetime(2026, 8, 31, 9, 0, tzinfo=UTC)

ANSWERS = (
    SharedAnswer(
        route_id="R9",
        section="신분·행정",
        question="주민등록증이 있으신가요?",
        answer="없어요",
    ),
    SharedAnswer(
        route_id="R1",
        section="주거",
        question="오늘 지낼 곳이 있으신가요?",
        answer="없어요",
    ),
)


class FakeVisits:
    """요약이 붙는 자리만 흉내 내는 저장소."""

    def __init__(self, row: VisitRequest | None) -> None:
        self.row = row
        self.saved: list[tuple[str, SummaryStatus]] = []
        self.raise_on_save = False

    def by_id(self, request_id: UUID) -> VisitRequest | None:
        return self.row

    def save_summary(
        self,
        request_id: UUID,
        summary: str,
        status: SummaryStatus,
        *,
        now: datetime,
    ) -> None:
        if self.raise_on_save:
            raise RuntimeError("저장 실패")
        self.saved.append((summary, status))
        if self.row is not None:
            self.row = replace(self.row, summary=summary, summary_status=status)


class CountingLlm:
    """몇 번 불렸는지와 무엇을 받았는지 센다."""

    def __init__(self, reply: str = "본인은 신분증과 지낼 곳이 모두 없는 상태입니다.") -> None:
        self.calls: list[str] = []
        # 마스킹에 쓸 이름이 실제로 흘러왔는지 센다.
        self.names: list[str | None] = []
        self.reply = reply

    async def summarize_visit(self, *, text: str, name: str | None = None) -> str:
        self.calls.append(text)
        self.names.append(name)
        return self.reply


class BrokenLlm:
    async def summarize_visit(self, *, text: str, name: str | None = None) -> str:
        raise RuntimeError("업스트림 오류")


def make_request(answers: tuple[SharedAnswer, ...] = ANSWERS) -> VisitRequest:
    return VisitRequest(
        id=uuid4(),
        user_id=uuid4(),
        route_id="R9",
        org_kind=OrgKind.CENTER,
        status=VisitStatus.SENT,
        preferred_at_1=NOW,
        preferred_at_2=None,
        shared_answers=answers,
        shared_answers_consented_at=NOW if answers else None,
        summary_status=SummaryStatus.PENDING if answers else SummaryStatus.NONE,
    )


# ── 입력 만들기 ──


def test_input_carries_purpose_as_a_readable_name() -> None:
    """**항목 코드를 그대로 보내지 않는다.** 'R9'라고 적어 보내면 모델이
    그것을 요약문에 옮겨 적고, 담당자는 뜻 모를 코드를 읽게 된다."""
    text = build_summary_input(ANSWERS, "신분증")
    assert "방문 목적: 신분증" in text
    assert "R9" not in text


def test_input_keeps_every_answer_line() -> None:
    """스무 줄이 와도 줄이 사라지지 않는다 — 요약의 근거가 되는 것이 이 목록이다."""
    many = tuple(
        SharedAnswer(
            route_id="R2",
            section="생계·긴급비용",
            question=f"{i}번 문항입니다",
            answer=f"{i}번 답입니다",
        )
        for i in range(20)
    )
    lines = [ln for ln in build_summary_input(many, "긴급지원").splitlines()
             if ln.startswith("- [")]
    assert len(lines) == 20


def test_instruction_forbids_writing_a_name() -> None:
    """마스킹에는 복원이 없다. 이름을 쓰라고 지시하면 모델은 지어낼 수밖에 없다."""
    assert "'본인'이라고 씁니다" in SUMMARY_INSTRUCTION


# ── 유스케이스 ──


def test_ready_when_the_model_answers() -> None:
    visits = FakeVisits(make_request())
    llm = CountingLlm()
    usecase = VisitSummaryUseCase(visits=visits, llm=llm)

    asyncio.run(usecase.generate(visits.row.id, now=NOW))  # type: ignore[union-attr]

    assert len(llm.calls) == 1
    assert visits.saved == [
        ("본인은 신분증과 지낼 곳이 모두 없는 상태입니다.", SummaryStatus.READY)
    ]


def test_no_call_when_nothing_was_shared() -> None:
    """**동의하지 않은 요청에는 손대지 않는다.** 부르면 돈이 나가고, 만들어 봐야
    담당자 화면에는 요약 구역 자체가 없다."""
    visits = FakeVisits(make_request(answers=()))
    llm = CountingLlm()
    usecase = VisitSummaryUseCase(visits=visits, llm=llm)

    asyncio.run(usecase.generate(visits.row.id, now=NOW))  # type: ignore[union-attr]

    assert llm.calls == []
    assert visits.saved == []


def test_failure_does_not_escape_and_leaves_a_status() -> None:
    """백그라운드에서 도는 일이라 예외를 받아 줄 사람이 없다. 그리고 pending으로
    남겨 두면 담당자 화면이 오지 않을 요약을 계속 기다린다."""
    visits = FakeVisits(make_request())
    usecase = VisitSummaryUseCase(visits=visits, llm=BrokenLlm())

    asyncio.run(usecase.generate(visits.row.id, now=NOW))  # type: ignore[union-attr]

    assert visits.saved == [("", SummaryStatus.FAILED)]


def test_empty_answer_is_not_stored_as_ready() -> None:
    """빈 요약을 ready로 두면 담당자 화면에 빈 카드가 그려진다."""
    visits = FakeVisits(make_request())
    usecase = VisitSummaryUseCase(visits=visits, llm=CountingLlm(reply="   "))

    asyncio.run(usecase.generate(visits.row.id, now=NOW))  # type: ignore[union-attr]

    assert visits.saved == [("", SummaryStatus.FAILED)]


def test_save_failure_is_swallowed_too() -> None:
    """요약을 저장하지 못하는 것도 방문 요청을 무르는 이유가 되지 않는다."""
    visits = FakeVisits(make_request())
    visits.raise_on_save = True
    usecase = VisitSummaryUseCase(visits=visits, llm=CountingLlm())

    asyncio.run(usecase.generate(visits.row.id, now=NOW))  # type: ignore[union-attr]


def test_skip_marks_failed_instead_of_leaving_pending() -> None:
    """지출 상한에 걸려 건너뛸 때도 상태는 정리한다."""
    visits = FakeVisits(make_request())
    usecase = VisitSummaryUseCase(visits=visits, llm=CountingLlm())

    usecase.skip(visits.row.id, now=NOW)  # type: ignore[union-attr]

    assert visits.saved == [("", SummaryStatus.FAILED)]


# ── 마스킹 ──


class SpyMessages:
    def __init__(self) -> None:
        self.sent: list[str] = []

    async def create(self, **kwargs: object) -> object:
        messages = kwargs["messages"]
        assert isinstance(messages, list)
        self.sent.append(str(messages[0]["content"]))

        class _Block:
            type = "text"
            text = "본인은 연락처를 남겨 두었습니다."

        class _Resp:
            content = [_Block()]

        return _Resp()


class SpyClient:
    def __init__(self) -> None:
        self.messages = SpyMessages()


def test_free_text_is_masked_before_it_leaves() -> None:
    """**답변에 섞인 연락처가 그대로 나가지 않는다.**

    `_to_messages`를 지나지 않는 경로라 마스킹을 따로 걸어야 했다. 이 테스트는
    그 자리가 비어 있으면 곧바로 깨진다.
    """
    llm = object.__new__(ClaudeChatLlm)
    spy = SpyClient()
    llm._client = spy  # type: ignore[attr-defined]
    llm._model = "claude-sonnet-5"  # type: ignore[attr-defined]
    llm._record_call = lambda: None  # type: ignore[attr-defined]

    dirty = build_summary_input(
        (
            SharedAnswer(
                route_id="R8",
                section="건강·심리",
                question="연락 가능한 번호가 있으신가요?",
                answer="010-1234-5678로 연락 주세요",
            ),
        ),
        "심리상담",
    )
    asyncio.run(llm.summarize_visit(text=dirty))

    assert "010-1234-5678" not in spy.messages.sent[0]
    assert "[전화번호]" in spy.messages.sent[0]





# ── 라우터가 실제로 걸어 주는가 ──
#
# **여기가 빠지면 유스케이스만 멀쩡하고 아무도 부르지 않는다.** 이 프로젝트에서
# 반복된 결함의 모양이 그것이라, 부르는 쪽도 함께 센다.


class SpySummaryUseCase(VisitSummaryUseCase):
    def __init__(self) -> None:
        visits = FakeVisits(None)
        super().__init__(visits=visits, llm=CountingLlm())
        self.skipped: list[UUID] = []

    def skip(self, request_id: UUID, *, now: datetime) -> None:
        self.skipped.append(request_id)


class FakeBackground:
    def __init__(self) -> None:
        self.tasks: list[object] = []

    def add_task(self, func: object, *args: object, **kwargs: object) -> None:
        self.tasks.append(func)


class FakeSpend:
    def __init__(self, allowed: bool) -> None:
        self.allowed = allowed

    def check(self) -> bool:
        return self.allowed


def make_http_request(usecase: object, spend: object) -> object:
    state = SimpleNamespace(visit_summary_usecase=usecase, spend=spend)
    return SimpleNamespace(app=SimpleNamespace(state=state))


def test_router_queues_the_summary_when_answers_came_along() -> None:
    usecase = SpySummaryUseCase()
    background = FakeBackground()

    _queue_summary(
        make_http_request(usecase, FakeSpend(True)),  # type: ignore[arg-type]
        background,  # type: ignore[arg-type]
        make_request(),
        NOW,
    )

    assert len(background.tasks) == 1


def test_router_does_not_queue_when_nothing_was_shared() -> None:
    usecase = SpySummaryUseCase()
    background = FakeBackground()

    _queue_summary(
        make_http_request(usecase, FakeSpend(True)),  # type: ignore[arg-type]
        background,  # type: ignore[arg-type]
        make_request(answers=()),
        NOW,
    )

    assert background.tasks == []


def test_router_settles_the_status_when_the_spend_cap_is_hit() -> None:
    """**pending으로 두고 떠나지 않는다.** 담당자 화면이 오지 않을 요약을 기다린다."""
    usecase = SpySummaryUseCase()
    background = FakeBackground()
    created = make_request()

    _queue_summary(
        make_http_request(usecase, FakeSpend(False)),  # type: ignore[arg-type]
        background,  # type: ignore[arg-type]
        created,
        NOW,
    )

    assert background.tasks == []
    assert usecase.skipped == [created.id]


# ── "하고 싶은 말"도 함께 요약한다 ──
#
# **고른 답만 요약하면 선택지를 다시 늘어놓는 일이 된다.** 왜 그렇게 되었는지는
# 본인이 직접 쓴 몇 줄에만 있고, 그래서 그 말을 함께 넣기로 했다(2026-08-31 결정).


def test_input_carries_what_the_person_wrote() -> None:
    text = build_summary_input(ANSWERS, "신분증", "일하러 가야 하는데 신분증이 없어 못 갑니다")

    assert "본인이 직접 쓴 말:" in text
    assert "일하러 가야 하는데 신분증이 없어 못 갑니다" in text


def test_input_leaves_the_block_out_when_nothing_was_written() -> None:
    """빈 제목만 남기지 않는다 — 모델이 그 자리를 채워야 할 것으로 읽는다."""
    assert "본인이 직접 쓴 말:" not in build_summary_input(ANSWERS, "신분증", "   ")


def test_usecase_passes_the_note_to_the_model() -> None:
    """유스케이스가 실제로 넘기는지 센다. 도메인만 고치고 부르는 쪽을 빠뜨리면
    이 프로젝트에서 반복된 그 결함이 된다."""
    visits = FakeVisits(replace(make_request(), note="당뇨약이 3일 뒤에 떨어집니다"))
    llm = CountingLlm()

    asyncio.run(VisitSummaryUseCase(visits=visits, llm=llm).generate(
        visits.row.id, now=NOW  # type: ignore[union-attr]
    ))

    assert "당뇨약이 3일 뒤에 떨어집니다" in llm.calls[0]


def test_contact_details_in_the_note_are_masked_before_they_leave() -> None:
    """**자유 입력이 들어오는 자리가 바로 여기다.** 답변은 선택지 라벨뿐이라
    가릴 것이 없지만, 이 말에는 이름과 연락처가 섞인다."""
    llm = object.__new__(ClaudeChatLlm)
    spy = SpyClient()
    llm._client = spy  # type: ignore[attr-defined]
    llm._model = "claude-sonnet-5"  # type: ignore[attr-defined]
    llm._record_call = lambda: None  # type: ignore[attr-defined]

    text = build_summary_input(
        ANSWERS, "신분증", "제 이름은 김판수이고 010-1234-5678로 연락 주세요"
    )
    asyncio.run(llm.summarize_visit(text=text))

    sent = spy.messages.sent[0]
    assert "김판수" not in sent
    assert "010-1234-5678" not in sent
    assert "[이름]" in sent
    assert "[전화번호]" in sent


# ── 마스킹에 쓸 이름이 흘러가는가 ──


class FakeAccounts:
    def __init__(self, name: str | None = "김판수", broken: bool = False) -> None:
        self.name = name
        self.broken = broken

    def by_id(self, user_id: UUID) -> object:
        if self.broken:
            raise RuntimeError("계정 조회 실패")
        return SimpleNamespace(name=self.name)


def test_the_name_reaches_the_model_call() -> None:
    """**요약문에 쓰라고 넘기는 것이 아니다.** 구현이 마스킹 인자로 쓴다."""
    visits = FakeVisits(make_request())
    llm = CountingLlm()

    asyncio.run(
        VisitSummaryUseCase(visits=visits, llm=llm, accounts=FakeAccounts()).generate(
            visits.row.id, now=NOW  # type: ignore[union-attr]
        )
    )

    assert llm.names == ["김판수"]


def test_summary_is_made_even_without_an_account_store() -> None:
    """저장이 꺼져 있으면 계정 저장소가 아예 없다. 그때도 요약은 만들어진다 —
    이름을 모르면 정규식이 문맥으로 잡는 이름만 가려질 뿐이다."""
    visits = FakeVisits(make_request())
    llm = CountingLlm()

    asyncio.run(VisitSummaryUseCase(visits=visits, llm=llm).generate(
        visits.row.id, now=NOW  # type: ignore[union-attr]
    ))

    assert llm.names == [None]
    assert visits.saved[0][1] is SummaryStatus.READY


def test_a_broken_account_lookup_does_not_stop_the_summary() -> None:
    visits = FakeVisits(make_request())
    llm = CountingLlm()

    asyncio.run(
        VisitSummaryUseCase(
            visits=visits, llm=llm, accounts=FakeAccounts(broken=True)
        ).generate(visits.row.id, now=NOW)  # type: ignore[union-attr]
    )

    assert llm.names == [None]
    assert visits.saved[0][1] is SummaryStatus.READY


# ── 조각으로 받는다 (2026-08-31) ──
#
# 문단 하나로 받던 것을 headline·points·prepare로 나눴다. **담당자가 창구에서
# 훑을 수 있어야 하는데** 다섯 문장이 이어 붙으면 원문을 읽는 것과 다르지 않았다.


def test_schema_asks_for_pieces_not_a_paragraph() -> None:
    assert set(SUMMARY_SCHEMA["properties"]) == {"headline", "points", "prepare"}


def test_instruction_asks_to_carry_what_the_person_wrote() -> None:
    assert "본인이 직접 쓴 말" in SUMMARY_INSTRUCTION


def test_normalize_keeps_well_formed_pieces() -> None:
    raw = json.dumps({
        "headline": "신분증 때문에 오십니다.",
        "points": [{"label": "신분", "text": "쓸 수 있는 신분증이 없습니다."}],
        "prepare": ["재발급 절차"],
    }, ensure_ascii=False)

    parsed = json.loads(normalize_summary(raw))

    assert parsed["headline"] == "신분증 때문에 오십니다."
    assert parsed["points"][0]["label"] == "신분"
    assert parsed["prepare"] == ["재발급 절차"]


def test_normalize_unwraps_a_code_fence() -> None:
    """모델이 ```json 으로 감싸 주는 경우가 있다."""
    raw = '```json\n{"headline": "가", "points": [], "prepare": []}\n```'
    assert json.loads(normalize_summary(raw))["headline"] == "가"


def test_normalize_trims_overflow() -> None:
    """넘치면 훑는 것이 아니라 읽는 일이 된다."""
    raw = json.dumps({
        "headline": "가",
        "points": [{"label": f"{i}", "text": f"{i}번"} for i in range(9)],
        "prepare": [f"{i}" for i in range(9)],
    }, ensure_ascii=False)

    parsed = json.loads(normalize_summary(raw))

    assert len(parsed["points"]) == MAX_POINTS
    assert len(parsed["prepare"]) == MAX_PREPARE


def test_normalize_keeps_an_old_paragraph_as_is() -> None:
    """옛 형식으로 저장된 요약이 그대로 남아 있고, 담당자에게는 여전히 쓸모가 있다."""
    old = "본인은 신분증이 없어 재발급을 받으러 오십니다."
    assert normalize_summary(old) == old


def test_normalize_rejects_an_empty_shape() -> None:
    """반쯤 만들어진 조각을 넘기면 화면이 빈 칸을 그린다 — 실패로 본다."""
    assert normalize_summary(json.dumps({"headline": "", "points": [], "prepare": []})) == ""
    assert normalize_summary("   ") == ""


def test_mock_client_answers_in_pieces() -> None:
    reply = asyncio.run(MockChatLlm().summarize_visit(text=build_summary_input(ANSWERS, "신분증")))
    parsed = json.loads(reply)
    assert parsed["headline"]
    assert parsed["points"]
