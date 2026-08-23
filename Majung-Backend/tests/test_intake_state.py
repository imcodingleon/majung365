"""판정 저장과 복원 — 세션이 끊겨도 할 일을 이어서 본다 (기획서 §5.2 · §9.1).

**이 기능이 지켜야 하는 것 둘이 서로 당긴다.**

하나는 복원이다. 앱을 닫거나 새로고침하면 가입 화면부터 다시 시작하던 것을 없애야
한다. 27문항을 다시 답하게 하는 것은 이 사용자층에게 특히 무거운 요구다.

다른 하나는 데이터 최소화다. 0006 마이그레이션이 답변 상시 저장을 거부하면서 이유를
적어 두었다 — 답변이 서버에 남으면 "오늘 밤 잘 곳이 없다 · 통장이 압류됐다"가 한 줄에
모이고, 그것은 출소 사실보다 구체적인 취약성 목록이 된다.

그래서 **판정만 저장한다.** 아래 테스트는 그 둘이 실제로 함께 성립하는지 본다 —
답변 없이도 같은 할 일이 복원되는가, 그리고 저장되는 값에 답변 원문이 없는가.
"""

import json

from app.domains.knowledge.application.intake_usecase import IntakeUseCase
from app.domains.knowledge.domain.graph_engine import routes_blocking_others
from app.domains.knowledge.infrastructure.graph_repository import JsonGraphRepository
from app.domains.knowledge.infrastructure.intake_rules_repository import (
    JsonIntakeRuleRepository,
)
from app.domains.knowledge.infrastructure.intake_state_repository import (
    _from_json,
    _to_json,
)
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository


def _usecase() -> IntakeUseCase:
    return IntakeUseCase(
        institutions=JsonInstitutionRepository(),
        rules=JsonIntakeRuleRepository().all(),
        blocking_routes=routes_blocking_others(JsonGraphRepository().nodes()),
    )


# 신분증이 없고 통장이 압류된 사람. **여러 항목에 걸리고 꼬리질문까지 타는 답**이라야
# 왕복 검사가 의미를 갖는다 — 판정이 비면 아래 비교들이 빈 값끼리 견주게 되어
# 아무것도 확인하지 못한 채 통과한다.
_ANSWERS: dict[str, object] = {
    "identityStatus": "NOT_USABLE",
    "counselingNeed": "NEEDED",
    "bankAccountStatus": "UNUSABLE",
    "bankAccountDetail": "SEIZED",
}


def test_복원한_할_일이_처음과_같다() -> None:
    """**답변 없이도 같은 목록이 나와야 한다.** 이것이 안 되면 복원은 의미가 없다."""
    intake = _usecase()

    first = intake.run(_ANSWERS)
    # 판정이 비면 아래 비교가 빈 값끼리 견주게 되어 무엇도 확인하지 못한다.
    assert len(first) >= 3, "검사에 쓰는 답이 여러 항목에 걸려야 한다"
    verdicts = intake.judge_only(_ANSWERS)
    restored = intake.from_verdicts(_from_json(_to_json(verdicts)))

    assert [t.route_id for t in restored] == [t.route_id for t in first]
    assert [t.card.summary_easy for t in restored] == [t.card.summary_easy for t in first]


def test_저장되는_값에_답변_원문이_없다() -> None:
    """§9.1 데이터 최소화. **판정에는 사람이 무엇을 답했는지가 담기지 않는다.**

    답이 아니라 그 답으로 내린 결론만 남는다는 것을 값으로 확인한다.
    """
    stored = _to_json(_usecase().judge_only(_ANSWERS))

    for answer in _ANSWERS.values():
        assert str(answer) not in stored, f"답변 원문이 저장 값에 들어 있다: {answer}"
    for key in _ANSWERS:
        assert key not in stored, f"문항 키가 저장 값에 들어 있다: {key}"


def test_마친_항목은_목록에서_빠진다() -> None:
    """완료를 반영해 다시 만든다. 서버 쪽 계산은 빼기만 한다 —
    화면에 남기는 일은 프론트가 완료 표시로 한다 (§5.2)."""
    intake = _usecase()
    verdicts = intake.judge_only(_ANSWERS)
    done = verdicts[0].route_id

    rest = intake.from_verdicts(verdicts, completed=frozenset({done}))

    assert done.value not in [t.route_id for t in rest]
    assert len(rest) == len(verdicts) - 1


def test_알_수_없는_항목이_섞여도_나머지는_읽힌다() -> None:
    """**한 줄이 깨졌다고 화면 전체가 안 열리면 안 된다.**

    지원 항목이 폐기되거나(R5가 그랬다) 상태값이 바뀌면 옛 행이 남는다.
    """
    verdicts = _usecase().judge_only(_ANSWERS)
    rows = json.loads(_to_json(verdicts))
    rows.append({"route_id": "R99", "section_id": "S1", "blocks_others": False, "state": "X"})

    assert len(_from_json(json.dumps(rows))) == len(verdicts)


def test_판정_왕복에서_상태와_지정이_보존된다() -> None:
    """압류와 은행 자체 제한은 할 일이 정반대다. 그 갈림이 `lead_override`에 있어서
    왕복에서 잃으면 **복원된 화면이 틀린 안내를 낸다.**"""
    verdicts = _usecase().judge_only(_ANSWERS)
    back = _from_json(_to_json(verdicts))

    for before, after in zip(verdicts, back, strict=True):
        assert after.route_id == before.route_id
        assert after.section_id == before.section_id
        assert after.state == before.state
        assert after.lead_override == before.lead_override
        assert after.override_is_specific == before.override_is_specific
        assert after.blocks_others == before.blocks_others


def test_빈_판정도_읽힌다() -> None:
    """모든 문항에 "괜찮다"고 답한 사람이다. 할 일이 없는 것도 정상이다."""
    assert _from_json(_to_json(())) == ()


def test_압류와_은행제한의_갈림이_복원된다() -> None:
    """**압류는 은행이 풀어줄 수 없다.** 꼬리질문이 가른 이 차이가 왕복에서 사라지면
    복원된 화면이 "은행에 가세요"라고 틀린 안내를 낸다."""
    intake = _usecase()

    def card_name(answers: dict[str, object]) -> str:
        verdicts = _from_json(_to_json(intake.judge_only(answers)))
        return next(t for t in intake.from_verdicts(verdicts) if t.route_id == "R10").card.name

    assert "압류" in card_name(
        {"bankAccountStatus": "UNUSABLE", "bankAccountDetail": "SEIZED"}
    )
    assert "압류" not in card_name(
        {"bankAccountStatus": "UNUSABLE", "bankAccountDetail": "BANK_LIMIT"}
    )
