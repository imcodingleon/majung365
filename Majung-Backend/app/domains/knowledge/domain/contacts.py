"""제도의 연락처·창구 안내 조립 — 순수 Python (Domain).

기획서 §6.4 ③단계. **전화번호는 LLM에게 맡기지 않고 서버가 붙인다** — 틀리면
헛걸음이 되는 값이다.

규칙 넷을 여기서 지킨다.
1. **창구 안내가 전화번호보다 먼저다.** 전화를 걸면 무엇을 물어야 할지 또 판단해야
   하지만, 창구에서는 한 문장만 말하면 된다
2. **기관명을 번호와 반드시 함께 낸다.** "1670-7004"만 있으면 어디에 거는지 모른다
3. **지부·지사 번호를 대표번호 자리에 넣지 않는다.** 사용자의 지역을 확정할 수 없다
4. **매칭에 실패하면 공단 대표번호로 대체한다** — 어디든 물어볼 곳은 있어야 한다
"""

from dataclasses import dataclass

from app.domains.knowledge.domain.entity import Institution
from app.domains.shared.hotlines import KOREHA, hotline


@dataclass(frozen=True)
class Desk:
    """어디로 가서 무슨 말을 하면 되는지. 갈 곳이 하나로 정해지는 항목만 갖는다."""

    place: str
    say: str


@dataclass(frozen=True)
class Contact:
    org: str
    phone: str
    hours: str = ""


def desk_of(inst: Institution) -> Desk | None:
    """창구 안내. 없으면 None — 화면은 그때 이 자리를 만들지 않는다."""
    if not inst.desk_place:
        return None
    return Desk(place=inst.desk_place, say=inst.desk_say)


def contact_of(inst: Institution) -> Contact:
    """연락처. 제도에 지정된 것이 없거나 목록에서 찾지 못하면 공단 대표번호로 대체한다.

    빈 값을 돌려주지 않는 이유는 **어디든 물어볼 곳은 있어야** 하기 때문이다.
    통장(R10)처럼 대표 연락처가 없는 항목도 창구 안내가 먼저 나가고 이 번호가 보조로 붙는다.
    """
    found = hotline(inst.contact_key) if inst.contact_key else None
    if found is None:
        fallback = hotline(KOREHA)
        assert fallback is not None, "대체 번호가 공용 목록에 없다"
        found = fallback
    return Contact(org=found.org, phone=found.number, hours=found.hours)
