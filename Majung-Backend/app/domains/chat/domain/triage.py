"""triage 결과 값객체 — 순수 Python (Domain)."""

from dataclasses import dataclass
from enum import StrEnum

from app.domains.knowledge.domain.graph_engine import NodeState
from app.domains.shared.routes import RouteId


class QuestionType(StrEnum):
    SUPPORT = "support"  # 제도 안내가 필요한 지원 질문 → KB 카드 매칭
    DAILY = "daily"  # 일상·디지털·감정 등 폭넓은 질문 → 자유 답변(+웹 검색 가능)


class ReasonCode(StrEnum):
    """왜 이 항목이 먼저인지. **모델이 고르지 않고 서버가 데이터에서 도출한다.**

    자유 문구를 쓰면 사용자가 말한 죄목이 이유에 실려 화면에 남는다("사기 이력이 있어
    통장 개설이 어려울 수 있어요"). 죄목을 열람 화면에서 가려도 이 한 줄이 떠 있으면
    소용이 없고, 하필 어깨 너머로 가장 자주 보이는 자리다. 연락처를 서버가 붙이기로 한
    것과 같은 이유로, 규칙으로 보장해야 하는 것은 프롬프트가 아니라 코드에 둔다.

    목록을 짧게 유지하는 기준: **화면 어디에도 없는 새 정보인가.** 기한은 카드의 기한
    배너가, 무엇을 하는 일인지는 항목 라벨이 이미 말한다. 그래서 사유의 기본값은 '없음'이고,
    대부분의 항목에서 비는 것이 정상 동작이다.
    """

    # 이 항목이 다른 항목의 선행조건이다. 그래프 구조가 아는 사실이고 화면 어디에도 없다.
    BLOCKS_OTHERS = "blocks_others"
    # 준비물 없이 바로 시작할 수 있다. 카드의 '필요 서류'는 있을 때만 나오므로,
    # 없다는 사실 자체는 화면에 드러나지 않는다.
    NO_DOCUMENTS = "no_documents"


# 사유 문구. 코드가 조립하고 모델은 관여하지 않는다.
# 재촉으로 읽히지 않게 쓴다 — "이걸 해야 다른 게 열려요"는 안 하면 막힌다는 뜻이 앞에 서고,
# "먼저 해두면 수월해져요"는 하면 편해진다는 뜻이 앞에 선다. 같은 사실인데 압박의 방향이 다르다.
REASON_TEXTS: dict[ReasonCode, str] = {
    ReasonCode.BLOCKS_OTHERS: "이걸 먼저 해두면 다음 일들이 수월해져요.",
    ReasonCode.NO_DOCUMENTS: "따로 챙길 서류가 없어요.",
}


def reason_text(code: ReasonCode | None) -> str:
    """사유 문구. 없으면 빈 문자열 — 화면은 그때 이 줄을 그리지 않는다."""
    return REASON_TEXTS[code] if code else ""


@dataclass(frozen=True)
class RoutePriority:
    """모델은 '무엇이 급한지'만 고른다. '왜 급한지'는 서버가 데이터에서 도출한다."""

    route: RouteId
    # 그 항목이 지금 어떤 상태인가. **초기 진단은 문항으로 아는 것을 챗은 문장으로 안다.**
    #
    # "통장이 압류돼서 돈을 못 써요"라고 말한 사람에게 "계좌를 새로 만드세요"가
    # 나가면 안 되는데, 챗은 초기 진단 답변을 갖고 있지 않다(저장하지 않는다).
    # 사용자의 말이 그 정보를 가진 유일한 자리다.
    #
    # 모델이 안 내면 X로 둔다 — 지금까지와 같은 동작이다.
    state: NodeState = NodeState.X


@dataclass(frozen=True)
class UserRegion:
    """사용자가 자기 입으로 말한 지역.

    **§5.4가 "동을 모른다"고 한 것은 위치로 알아내는 경로를 말한 것이다.**
    좌표를 서버로 보내지 않으니 기기가 알려줄 수 있는 것은 시군구까지인데,
    사용자가 "송파구 오금동 사는데"라고 말하면 그 제약을 받지 않는다.

    말하지 않은 것은 빈 문자열이다. 짐작해서 채우지 않는다.
    """

    sido: str = ""
    sigungu: str = ""
    dong: str = ""

    @property
    def has_dong(self) -> bool:
        return bool(self.dong)


@dataclass(frozen=True)
class TriageResult:
    question_type: QuestionType
    priorities: tuple[RoutePriority, ...]  # 급한 순, 보통 2~3개 (DAILY면 비어도 됨)
    # 사용자가 말한 지역. 주민센터처럼 동 단위 안내에 쓴다.
    region: UserRegion = UserRegion()
