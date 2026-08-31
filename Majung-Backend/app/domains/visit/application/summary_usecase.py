"""담당자가 먼저 읽는 요약을 만든다 (Application) — 기획서 §7.4.

`VisitUseCase`와 나눠 둔다. 그쪽은 동기 함수 묶음이고 이쪽은 모델을 기다리는
비동기 작업이며, 무엇보다 **여기서 무슨 일이 나도 방문 요청은 이미 저장되어
있어야 한다.** 한 클래스에 두면 그 경계가 흐려진다.

**예외를 밖으로 내보내지 않는다.** 이 유스케이스는 요청을 보낸 뒤 백그라운드에서
돌아가므로 예외를 받아 줄 사람이 없고, 요약이 없다고 담당자가 못 보는 것도 없다.
실패는 상태로 남기고 끝낸다.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from app.domains.shared.routes import RouteId, label_for
from app.domains.visit.application.port import SummaryLlm
from app.domains.visit.domain.entity import SummaryStatus
from app.domains.visit.domain.repository import VisitRepository
from app.domains.visit.domain.summary import build_summary_input

logger = logging.getLogger("majung.visit")


def _purpose_of(route_id: str) -> str:
    """지원 항목 코드를 사람이 읽는 이름으로. **모르는 코드는 비운다** —
    "R9"라고 적어 보내면 모델이 그것을 그대로 요약문에 옮긴다."""
    try:
        return label_for(RouteId(route_id))
    except ValueError:
        return ""


@dataclass
class VisitSummaryUseCase:
    visits: VisitRepository
    llm: SummaryLlm
    # 이름을 꺼내 마스킹에 넘기려고 둔다. **요약문에 쓰려는 것이 아니다** —
    # 없으면 없는 대로 진행한다(저장이 꺼져 있으면 아예 None이다).
    accounts: object | None = None

    async def generate(self, request_id: UUID, *, now: datetime) -> None:
        current = self.visits.by_id(request_id)
        if current is None or not current.shared_answers:
            # 동의한 답변이 없으면 요약할 것도 없다. 상태는 create가 none으로 둔다.
            return

        # **"하고 싶은 말"을 함께 넘긴다.** 고른 답만 요약하면 선택지를 다시
        # 늘어놓는 일이 된다 — 사정은 본인이 직접 쓴 그 몇 줄에만 있다.
        text = build_summary_input(
            current.shared_answers, _purpose_of(current.route_id), current.note
        )
        name = self._name_of(current.user_id)
        try:
            summary = (await self.llm.summarize_visit(text=text, name=name)).strip()
        except Exception:
            # **원문을 로그에 남기지 않는다**(MUST 7). 예외 메시지에 사용자 입력이
            # 섞여 들어오는 경로가 있어 예외 객체 자체도 찍지 않는다.
            logger.warning("방문 요약을 만들지 못했다 — 담당자는 답변 원문을 본다")
            self._mark_failed(request_id, now)
            return

        if not summary:
            logger.warning("방문 요약이 비어 돌아왔다")
            self._mark_failed(request_id, now)
            return

        try:
            self.visits.save_summary(
                request_id, summary, SummaryStatus.READY, now=now
            )
        except Exception:
            logger.warning("방문 요약을 저장하지 못했다")
            self._mark_failed(request_id, now)

    def skip(self, request_id: UUID, *, now: datetime) -> None:
        """만들지 않고 넘어간다 — 지출 상한에 걸렸을 때.

        **pending으로 두고 떠나지 않는다.** 그러면 담당자 화면이 오지 않을 요약을
        영영 기다리며 "만들고 있습니다"를 보인다.
        """
        self._mark_failed(request_id, now)

    def _name_of(self, user_id: UUID) -> str | None:
        """마스킹에 넘길 이름. **못 찾아도 요약을 멈추지 않는다.**

        이름을 모르면 정규식이 문맥으로 잡는 이름만 가려진다. 그 상태가
        지금까지의 동작이므로, 조회에 실패했다고 요약을 포기할 이유는 없다.
        죄목 저장소는 여기서 부르지 않는다(visit 라우터의 `_name_of`와 같은 판단).
        """
        if self.accounts is None:
            return None
        by_id = getattr(self.accounts, "by_id", None)
        if not callable(by_id):
            return None
        try:
            account = by_id(user_id)
        except Exception:
            logger.warning("요약에 쓸 이름을 읽지 못했다 — 이름 없이 진행한다")
            return None
        name = getattr(account, "name", None)
        return name if isinstance(name, str) and name else None

    def _mark_failed(self, request_id: UUID, now: datetime) -> None:
        try:
            self.visits.save_summary(request_id, "", SummaryStatus.FAILED, now=now)
        except Exception:
            logger.warning("방문 요약 실패 상태를 남기지 못했다")
