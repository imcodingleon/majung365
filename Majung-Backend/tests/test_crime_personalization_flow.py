"""수용 사유가 저장되고 다시 읽혀 안내가 붙기까지 — HTTP 왕복 (§9.4).

**이 파일이 없으면 비어 있는 구간이 있었다.** 유닛 테스트는 유스케이스를 직접
불렀고 화면 검증은 서버 응답을 가짜로 채웠다. 그 사이 — 가입 요청이 죄목을 싣고
와서 저장되고, 다음 요청에서 그것을 읽어 안내를 붙이는 경로 — 는 아무도 태우지
않았다. 이 프로젝트에서 결함은 대개 그런 자리에서 났다(한쪽만 고치고 짝을 안 봄).

여기서 지키는 것 넷이다.

1. 가입 응답에 곧바로 안내가 실린다
2. **세션 토큰만으로 되살려도 안내가 그대로 붙는다** — 저장·조회를 실제로 지난다
3. 밝히지 않은 사람에게는 사유와 무관한 안내만 간다
4. 동의를 철회하면 다음 요청부터 사라진다
"""

from dataclasses import dataclass, field
from datetime import date
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.domains.account.application.usecase import SignupUseCase
from app.domains.account.domain.entity import Account, Consent, CrimeCategory, Session
from app.domains.account.domain.tokens import expires_at, utcnow
from app.domains.knowledge.domain.state import IntakeState
from app.main import create_app

# 사기는 이 대분류에 들어간다. 화면 선택지의 "재산·경제범죄"가 이 값이다.
FRAUD = "property"

# 통장·빚 문제·일자리가 할 일이 되게 하는 답.
#
# **문항 키는 intake_rules.json이 정본이다.** 여기 적힌 키가 어긋나면 그 항목이
# 할 일이 되지 않아, 안내가 붙지 않았는지 애초에 항목이 없었는지 구별되지 않는다.
ANSWERS = {
    "bankAccountStatus": "NONE",  # 통장 없음 → R10
    "debtProcedureStage": "NONE",  # 빚 절차 없음 → R14
    "employmentCurrentStatus": "LOOKING",  # 일하고 있지 않음 → R6
}


@dataclass
class Accounts:
    saved: list[Account] = field(default_factory=list)
    consents: list[Consent] = field(default_factory=list)

    def create(
        self, *, name: str, birth_date: date, release_date: date, consents: list[Consent]
    ) -> Account:
        account = Account(
            id=uuid4(),
            name=name,
            birth_date=birth_date,
            release_date=release_date,
            created_at=utcnow(),
            last_seen_on=date.today(),
        )
        self.saved.append(account)
        self.consents.extend(consents)
        return account

    def by_id(self, user_id: UUID) -> Account | None:
        return next((a for a in self.saved if a.id == user_id), None)

    def record_consent(self, user_id: UUID, consent: Consent) -> None:
        self.consents.append(consent)

    def touch(self, user_id: UUID, today: date) -> None: ...

    def delete(self, user_id: UUID) -> None: ...


@dataclass
class Crimes:
    stored: dict[UUID, str] = field(default_factory=dict)

    def set(self, user_id: UUID, category: str) -> CrimeCategory:
        self.stored[user_id] = category
        return CrimeCategory(user_id, category, utcnow())

    def by_user(self, user_id: UUID) -> CrimeCategory | None:
        cat = self.stored.get(user_id)
        return CrimeCategory(user_id, cat, utcnow()) if cat else None

    def revoke(self, user_id: UUID) -> None:
        self.stored.pop(user_id, None)


@dataclass
class Sessions:
    """**토큰이 실제 계정을 가리킨다.** 아무 계정이나 돌려주면 왕복이 성립하지 않는다."""

    issued: dict[str, UUID] = field(default_factory=dict)

    def issue(self, user_id: UUID) -> str:
        token = f"token-{user_id}"
        self.issued[token] = user_id
        return token

    def resolve(self, token: str, today: date) -> Session | None:
        user_id = self.issued.get(token)
        return Session(user_id, expires_at(utcnow())) if user_id else None

    def revoke_all(self, user_id: UUID) -> None:
        for t, uid in list(self.issued.items()):
            if uid == user_id:
                del self.issued[t]


@dataclass
class States:
    stored: dict[UUID, IntakeState] = field(default_factory=dict)

    def save(self, user_id: UUID, verdicts: tuple) -> None:  # type: ignore[type-arg]
        done = self.stored[user_id].completed if user_id in self.stored else frozenset()
        self.stored[user_id] = IntakeState(verdicts=verdicts, completed=done)

    def by_user(self, user_id: UUID) -> IntakeState | None:
        return self.stored.get(user_id)

    def set_completed(self, user_id: UUID, completed: frozenset[str]) -> None:
        cur = self.stored.get(user_id)
        if cur:
            self.stored[user_id] = IntakeState(verdicts=cur.verdicts, completed=completed)


@pytest.fixture
def client() -> TestClient:
    """저장소만 가짜로 끼운다. **라우터·유스케이스·직렬화는 실제 경로를 지난다.**"""
    app = create_app()
    accounts, crimes, sessions, states = Accounts(), Crimes(), Sessions(), States()
    app.state.account_repo = accounts
    app.state.crime_repo = crimes
    app.state.session_repo = sessions
    app.state.intake_state_repo = states
    app.state.signup_usecase = SignupUseCase(
        accounts=accounts,
        crimes=crimes,
        sessions=sessions,
        intake=app.state.intake_usecase,
        states=states,
    )
    return TestClient(app)


def _signup(client: TestClient, crime: str | None) -> dict:
    body: dict[str, object] = {
        "name": "김판수",
        "birth_date": "1975-03-02",
        "release_date": "2026-08-03",
        "answers": ANSWERS,
        "consents": [{"kind": "privacy", "agreed": True}],
    }
    if crime:
        body["consents"].append({"kind": "crime", "agreed": True})  # type: ignore[union-attr]
        body["crime_category"] = crime
    r = client.post("/api/signup", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _notices(payload: dict, route: str) -> list[dict]:
    task = next((t for t in payload["tasks"] if t["route_id"] == route), None)
    return task["notices"] if task else []


# ── 가입 응답 ──────────────────────────────────────────────────────────


def test_signup_answer_already_carries_the_notice(client: TestClient) -> None:
    """27문항을 답한 직후 화면에 바로 뜬다. 다시 불러올 것 없이."""
    body = _signup(client, FRAUD)

    bank = _notices(body, "R10")

    assert bank, "통장 항목에 안내가 없다"
    assert bank[0]["headline"] == "한도제한계좌 안내"
    # **조문 원문이 함께 나간다.** 풀어 쓴 문장만 있으면 우리 해석을 그대로 믿어야 한다.
    assert "접근매체" in bank[0]["sources"][0]["quote"]


def test_notice_never_claims_a_legal_ban(client: TestClient) -> None:
    """**일반 사기죄 유죄만으로 계좌 개설이 법으로 금지되지는 않는다.**

    문장이 강해지면 해당하지 않는 사람이 그것을 읽고 포기한다. 이 기능의 가장
    나쁜 실패다.
    """
    bank = _notices(_signup(client, FRAUD), "R10")[0]

    assert "금지" not in bank["body"]
    assert "법으로 막히지는 않아요" in bank["myth"]


# ── 저장 → 조회 왕복 ───────────────────────────────────────────────────


def test_notice_survives_a_session_restore(client: TestClient) -> None:
    """**여기가 이 파일의 핵심이다.**

    앱을 닫았다 열면 세션 토큰만 남는다. 그때 서버가 죄목을 다시 읽어 안내를
    붙이지 못하면, 가입 직후에만 보이고 다음부터는 사라진다 — 사용자는 그것을
    "없어졌다"가 아니라 "원래 없었다"로 읽는다.
    """
    token = _signup(client, FRAUD)["session_token"]

    r = client.get("/api/tasks", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 200, r.text
    restored = r.json()
    assert _notices(restored, "R10")[0]["headline"] == "한도제한계좌 안내"
    assert _notices(restored, "R14")[0]["headline"] == "파산해도 남는 빚"


def test_undisclosed_gets_only_category_free_notices(client: TestClient) -> None:
    """밝히지 않아도 경비업법 안내는 간다. 형을 살았다는 사실에 붙는 제약이다.

    그리고 **그 문구는 수용 사유를 언급하지 않는다.** 언급하면 밝히지 않은
    사용자에게 관계없는 말이 나가고, 그 자체로 캐묻는 인상이 된다.
    """
    token = _signup(client, None)["session_token"]

    body = client.get("/api/tasks", headers={"Authorization": f"Bearer {token}"}).json()

    assert _notices(body, "R10") == [], "밝히지 않았는데 통장 안내가 나갔다"
    job = _notices(body, "R6")
    assert [n["headline"] for n in job] == ["경비 일자리 제한"]
    assert "수용 사유가" not in job[0]["body"]


def test_revoking_consent_removes_the_notice(client: TestClient) -> None:
    """동의를 철회하면 다음 요청부터 사라진다. 안내는 저장하지 않고 매번 조립한다."""
    token = _signup(client, FRAUD)["session_token"]
    auth = {"Authorization": f"Bearer {token}"}
    assert _notices(client.get("/api/tasks", headers=auth).json(), "R10")

    r = client.patch("/api/me", json={"crime_category_revoked": True}, headers=auth)
    assert r.status_code == 200, r.text

    assert _notices(client.get("/api/tasks", headers=auth).json(), "R10") == []


# ── 새어 나가면 안 되는 것 ─────────────────────────────────────────────


def test_response_never_carries_the_raw_category(client: TestClient) -> None:
    """**코드값이 응답에 실리지 않는다.**

    화면에 나가는 것은 서버가 조립한 문장이지 "property"가 아니다. 열람 화면이
    죄목을 가려도(§7.4) 이 값이 함께 오면 소용이 없다.
    """
    token = _signup(client, FRAUD)["session_token"]

    raw = client.get("/api/tasks", headers={"Authorization": f"Bearer {token}"}).text

    assert '"property"' not in raw
    assert "죄목" not in raw
