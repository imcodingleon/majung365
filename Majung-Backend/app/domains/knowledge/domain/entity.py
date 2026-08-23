"""제도 지식베이스 Entity — 순수 Python (Domain).

카드로 인용되는 제도의 원천. 모델이 이 내용을 지어내지 않고, 서버가 여기서 매칭해 붙인다.
"""

from dataclasses import dataclass, field

from app.domains.shared.routes import RouteId


@dataclass(frozen=True)
class Institution:
    id: str
    # 한 제도가 여러 지원 항목의 근거가 될 수 있다(예: 주민등록 재등록 → R9·R11).
    route_ids: tuple[RouteId, ...]
    # 이 제도가 대표인 항목들. 항목마다 대표는 정확히 하나이고, 카드로 먼저 나가는 것이 대표다.
    # route_ids의 부분집합이며, 근거이기만 하고 대표가 아닌 항목은 여기 들어가지 않는다.
    lead_for: tuple[RouteId, ...]
    name: str
    summary_easy: str
    where: str
    docs: tuple[str, ...] = field(default_factory=tuple)
    next_step: str = ""
    deadline: str | None = None
    source_url: str = ""

    # 이 제도가 대표와 함께 나가는 항목들. 하나로 끝내면 안 되는 경우를 위한 것이다 —
    # R2(공단 긴급지원)는 공단 제도와 정부 긴급복지가 서로 다른 경로라 둘 다 보여줘야 한다.
    # route_ids의 부분집합이고 lead_for와는 겹치지 않는다(같은 항목에서 대표이자 동반일 수 없다).
    companion_for: tuple[RouteId, ...] = ()

    # ── 결과 카드 확장 필드 (기획서 §4.1) ──
    # 전부 선택이다. 값이 없으면 화면이 그 자리를 만들지 않는다.
    # 제도 요건 문구는 잘못 적으면 자격이 되는 사람을 돌려세우므로, 스키마를 먼저 두고
    # 값은 확정된 것부터 채운다.

    # 지원 내용·금액·기간. 예: "연이율 2.5%로 최대 5천만원, 최대 6년"
    benefit_summary: str = ""
    # "먼저 확인할 것". **사용자가 스스로 확인하라는 목록이 아니라, 상담에서 다뤄질 항목을
    # 미리 알려주는 것이다.** 사용자가 답할 수 없는 조건을 요구로 적으면 안 된다 —
    # "채무불이행자 명부 미등재를 확인하세요"가 아니라 "빚 문제로 법원에 이름이 올라가
    # 있으면 어려울 수 있어요. 담당자가 확인해 줄 거예요"처럼 쓴다.
    eligibility: tuple[str, ...] = field(default_factory=tuple)
    # 다단계 절차. next_step 한 줄로 담기지 않을 때만 채운다(대부분은 한 줄로 끝난다).
    steps: tuple[str, ...] = field(default_factory=tuple)
    # 모르고 가면 헛걸음이 되는 것. 예: "임차보증금의 50% 이상은 본인이 준비해야 해요"
    cautions: tuple[str, ...] = field(default_factory=tuple)
