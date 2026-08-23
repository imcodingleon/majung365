"""가입 정보 Repository Port — Domain이 의존하는 인터페이스. 구현은 infrastructure에.

**죄목을 따로 조회하게 나눠 두었다.** 계정을 읽는 것과 죄목을 읽는 것이 다른
메서드라, 담당자 화면처럼 죄목이 가면 안 되는 경로(§7.4)에서 실수로 딸려올 일이 없다.
"""

from datetime import date
from typing import Protocol
from uuid import UUID

from app.domains.account.domain.entity import Account, Consent, CrimeCategory, Session


class AccountRepository(Protocol):
    def create(
        self,
        *,
        name: str,
        birth_date: date,
        release_date: date,
        consents: list[Consent],
    ) -> Account:
        """가입. 평문을 받아 저장 직전에 암호화한다 — 도메인은 암호문을 모른다."""
        ...

    def by_id(self, user_id: UUID) -> Account | None: ...

    def touch(self, user_id: UUID, today: date) -> None:
        """마지막 접속일 갱신. **하루 한 번만 쓴다**(§9.4 보관 기간 계산용) —
        매 요청마다 쓰면 읽기만 하는 화면에서도 쓰기가 생긴다."""
        ...

    def delete(self, user_id: UUID) -> None:
        """즉시 파기(§9.4). 죄목·동의·세션이 함께 지워진다(on delete cascade)."""
        ...


class CrimeRepository(Protocol):
    """죄목 전용. 이 포트를 주입받지 않은 곳은 죄목에 닿을 수 없다."""

    def set(self, user_id: UUID, category: str) -> CrimeCategory: ...

    def by_user(self, user_id: UUID) -> CrimeCategory | None: ...

    def revoke(self, user_id: UUID) -> None:
        """동의 철회. **그 행만 지운다** — 계정은 남는다(§9.5)."""
        ...


class SessionRepository(Protocol):
    def issue(self, user_id: UUID) -> str:
        """세션을 만들고 **토큰 원문을 돌려준다.** 원문이 나가는 것은 이때 한 번뿐이고,
        서버에는 해시만 남는다."""
        ...

    def resolve(self, token: str, today: date) -> Session | None:
        """토큰으로 세션을 찾는다. 만료됐으면 None."""
        ...

    def revoke_all(self, user_id: UUID) -> None: ...
