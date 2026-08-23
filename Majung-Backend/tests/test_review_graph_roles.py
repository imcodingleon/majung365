"""계약 대조에서 나온 F1·F2 — 항목을 갈라 보지 못하던 자리.

둘 다 **사용자가 첫 화면에서 틀린 카드를 읽는** 문제였고, 뿌리가 같다.
그래프는 "이 자원을 얻는 방법"을 알지만 **그 방법이 어느 항목의 것인지**와
**대표인지 동반인지**는 판단하지 않는다. 그 둘을 그래프가 정하게 두면 어긋난다.

전문은 `_bmad-output/implementation-artifacts/code-review-2026-08-24.md`.
"""

from app.domains.knowledge.application.intake_usecase import IntakeUseCase
from app.domains.knowledge.infrastructure.graph_repository import JsonGraphRepository
from app.domains.knowledge.infrastructure.intake_rules_repository import (
    JsonIntakeRuleRepository,
)
from app.domains.knowledge.infrastructure.json_repository import (
    JsonInstitutionRepository,
)

# 잘 곳도 집도 급전도 필요한 사람 — R1·R4·R2가 한꺼번에 나오는 답이다.
_IN_NEED = {
    "accommodationStatus": "NO_PLACE_TONIGHT",
    "housingNeed": "NEEDED",
    "emergencyExpenseType": "LIVING",
}


def _cards() -> dict[str, object]:
    usecase = IntakeUseCase(
        JsonInstitutionRepository(),
        JsonIntakeRuleRepository().all(),
        graph_nodes=JsonGraphRepository().nodes(),
    )
    return {t.route_id: t.card for t in usecase.run(_IN_NEED)}


def test_shelter_node_serves_two_routes_differently() -> None:
    """**F1 — R4가 R1과 똑같은 카드를 냈다.**

    `shelter` 노드가 R1 숙식제공과 R4 주거지원을 함께 달고 있는데 경로를 항목으로
    가르지 않아, 미충족 개수가 같은 두 경로 중 먼저 선언된 쪽이 둘 다 이겼다.
    R4의 대표(공단 주거지원)는 어떤 경로로도 화면에 닿지 못했다.

    부팅 검사가 못 잡은 이유는 노드와 제도의 `route_ids`가 **한 칸이라도 겹치면**
    통과시켰기 때문이다. 겹침으로는 이 어긋남이 안 보인다.
    """
    cards = _cards()

    assert cards["R1"].institution_id == "housing-koreha-residence"
    assert cards["R4"].institution_id == "housing-koreha-rental"
    assert cards["R1"].institution_id != cards["R4"].institution_id, (
        "숙식제공과 주거지원은 별개 항목이다 — 같은 카드가 나오면 안 된다"
    )


def test_graph_does_not_promote_a_companion_to_lead() -> None:
    """**F2 — R2에서 공단 긴급지원이 카드에서 통째로 사라졌다.**

    `emergency_cash`의 유일한 경로가 정부 긴급복지(129)를 가리키는데 그것은 R2의
    *동반*이다. 동반이 대표 자리에 앉자 `_card_for`가 대표와 같은 id를 동반에서
    빼면서 **선언된 대표(공단 1670-7004)가 어디에도 남지 않았다.**

    `route-contacts.md` §1은 R2의 기본 연락처를 공단으로 두고 129는 §2의
    "함께 안내할 때" 붙는 번호로 적고 있다.
    """
    card = _cards()["R2"]

    assert card.institution_id == "welfare-koreha-emergency"
    phones = [o.contact_phone for o in card.options]
    assert "1670-7004" in phones, "공단이 대표로 나와야 한다"
    assert "129" in phones, "정부 긴급복지는 동반으로 함께 나와야 한다"


def test_rule_table_may_still_promote_a_companion() -> None:
    """**동반이면서 상황에 따라 대표가 되는 제도는 정상이다.**

    처음엔 "동반은 대표가 될 수 없다"로 넓게 막았다가 R10이 깨졌다. 압류 상황에서
    규칙표가 꼬리질문을 보고 압류방지 통장을 지정하는데 그 제도는 R10의 동반으로도
    선언돼 있다.

    **구분점은 누가 지정했느냐다.** 규칙표는 사람이 답변별로 적은 것이라 대표로
    세우려는 의도가 분명하고, 그래프는 역할까지 정한 것이 아니다.
    """
    usecase = IntakeUseCase(
        JsonInstitutionRepository(),
        JsonIntakeRuleRepository().all(),
        graph_nodes=JsonGraphRepository().nodes(),
    )
    seized = next(
        t
        for t in usecase.run(
            {"bankAccountStatus": "UNUSABLE", "bankAccountDetail": "SEIZED"}
        )
        if t.route_id == "R10"
    )
    assert "압류" in seized.card.name
