"""수용 사유에 따라 달라지는 법령 제약 — 순수 Python (Domain).

**세 번째 데이터 축이다.** `institutions.json`은 제도 원본이라 모든 사용자에게 같고,
`graph.json`은 보유 상태 넷(O/X/BLOCKED/UNKNOWN)으로 푸는 제약이다. 수용 사유는
그 넷 어디에도 담기지 않아 둘 중 어느 쪽에도 넣을 수 없다.

**문장을 LLM이 만들지 않는다.** 여기 적힌 검수된 문장이 그대로 화면에 나간다.
법률 안내는 틀리면 사용자가 헛걸음하거나 법을 어기게 되고, 그 둘 다 되돌릴 수 없다.

기획서 §9.4 · 2026-09-02 결정.
"""

from dataclasses import dataclass
from datetime import date

# 제약의 성격. **`clear`가 이 축을 만든 이유다** — 제약만 담으면 앱이 낙인을 옮긴다.
# "그건 해당하지 않아요"를 말할 자리가 없으면 사용자의 짐작을 그대로 굳힌다.
EFFECTS = frozenset({"blocked", "caution", "clear"})

# 인용한 조문이 이 사람에게 어떻게 걸리는가.
# `does_not_apply`는 조문을 인용하면서 "그러니 해당하지 않는다"고 말하는 근거다 —
# 인용의 방향이 데이터에 없으면 clear 문장을 쓸 수 없다.
RELEVANCES = frozenset({"applies", "applies_to_subset", "does_not_apply"})

# 화면이 얼마나 눈에 띄게 낼지. **숫자를 데이터 파일에 두지 않는다** —
# 가중치가 들어가면 검수자가 그 줄을 읽고 판단할 수 없다.
SEVERITIES = frozenset({"high", "normal", "info"})


@dataclass(frozen=True)
class LegalSource:
    """근거 조문 하나. 화면에 짧게 나가고 국가법령정보센터로 링크가 붙는다."""

    law: str
    article: str
    article_title: str
    quote: str
    url: str
    relevance: str

    @property
    def label(self) -> str:
        """화면에 나갈 한 줄. 법령명과 조번호를 함께 낸다 — 조번호만으로는 못 찾는다."""
        return f"{self.law} {self.article}"


@dataclass(frozen=True)
class LegalConstraint:
    """한 지원 항목에 걸리는 제약 하나.

    문장이 넷으로 갈린 것은 어체 규칙 때문이다(`copy-voice.md`).
    `body`는 시스템이 하는 일이라 합니다체, `what_to_do`는 사용자가 해야 할 일이라
    "~해 주세요", `myth`는 안심시키는 말이라 해요체다. 붙여 두면 한 갈래로 뭉개진다.
    """

    id: str
    route_id: str
    categories: frozenset[str]
    effect: str
    severity: str
    headline: str
    body: str
    myth: str
    what_to_do: str
    sources: tuple[LegalSource, ...]
    verified_at: date
    reviewed_by: str
    expires_on: date
    # 수용 사유를 밝히지 않은 사용자에게도 내보내는가.
    #
    # **경비업법 결격사유가 이 자리다.** 금고 이상 실형이면 죄목과 무관하게 5년간
    # 경비원이 될 수 없는데, 경비는 출소자가 가장 많이 찾는 직종이다. 동의한
    # 사람에게만 알리면 정작 알아야 할 사람 대부분이 못 듣는다.
    #
    # 이 값이 참인 항목은 **문구에서 수용 사유를 언급하지 않는다.** 언급하면
    # 밝히지 않은 사용자에게 관계없는 말이 나가고, 그 자체로 캐묻는 인상이 된다.
    applies_without_category: bool = False


# 무거운 것부터. `clear`가 맨 뒤인 것이 이 표의 요점이다.
_EFFECT_ORDER = {"blocked": 0, "caution": 1, "clear": 2}
_SEVERITY_ORDER = {"high": 0, "normal": 1, "info": 2}


def constraints_for(
    all_constraints: tuple[LegalConstraint, ...],
    category: str | None,
    route_id: str,
) -> tuple[LegalConstraint, ...]:
    """그 사람의 그 항목에 붙는 제약들.

    **수용 사유를 밝히지 않았으면 대부분 빈 튜플이다.** 동의는 선택이고(§3.3-⑥),
    철회하면 그 행만 지워진다. 비어 있는 것이 예외가 아니라 정상 경로다.

    `applies_without_category`가 켜진 항목만 그 경우에도 남는다 — 수용 사유가
    아니라 형을 살았다는 사실 자체에 붙는 제약이라 밝히고 말고와 무관하다.

    같은 항목에 여럿이 붙으면 **무거운 것부터** 낸다. 법으로 막힌 것이 주의보다
    앞서고, "해당하지 않는다"는 맨 뒤다 — 그것을 먼저 읽으면 뒤에 오는 제약을
    흘려 보게 된다. 같은 무게면 id 순으로 고정해 순서가 흔들리지 않게 한다.
    """
    matched = [
        c
        for c in all_constraints
        if c.route_id == route_id
        and (
            c.applies_without_category
            if category is None
            else category in c.categories
        )
    ]
    return tuple(
        sorted(
            matched,
            key=lambda c: (
                _EFFECT_ORDER.get(c.effect, 1),
                _SEVERITY_ORDER.get(c.severity, 1),
                c.id,
            ),
        )
    )
