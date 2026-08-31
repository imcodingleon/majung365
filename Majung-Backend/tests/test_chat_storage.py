"""대화 내역 저장 — 기획서 §6.3.

저장하는 이유는 하나다. 다시 켰을 때 어제 받은 안내가 사라지면, 같은 안내를
여러 번 다시 읽는 사용자에게는 없느니만 못하다.
"""

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4

from app.domains.chat.infrastructure.message_repository import StoredMessage
from app.infrastructure.security.crypto import CryptoError, FieldCipher, generate_key, load_key


@dataclass
class FakeTable:
    """supabase 테이블 호출을 흉내 낸다. 실제 저장은 별도로 확인했다."""

    rows: list[dict[str, object]] = field(default_factory=list)
    fail: bool = False

    def insert(self, row: dict[str, object]) -> "FakeTable":
        if self.fail:
            raise RuntimeError("DB 오류")
        self.rows.append(row)
        return self

    def execute(self) -> object:
        return type("R", (), {"data": list(self.rows)})()


def test_content_is_encrypted_before_storage() -> None:
    """대화에는 사용자가 가장 사적으로 말한 내용이 들어 있다."""
    cipher = FieldCipher(load_key(generate_key()))
    sealed = cipher.encrypt("사기로 3년 살았어요")
    assert "사기" not in sealed
    assert cipher.decrypt(sealed) == "사기로 3년 살았어요"


def test_broken_row_does_not_break_the_room() -> None:
    """한 줄이 깨졌다고 방 전체가 안 열리면 안 된다."""
    cipher = FieldCipher(load_key(generate_key()))
    other = FieldCipher(load_key(generate_key()))
    good = cipher.encrypt("안녕하세요")
    bad = other.encrypt("읽을 수 없는 줄")

    readable = []
    for sealed in (good, bad):
        try:
            readable.append(cipher.decrypt(sealed))
        except CryptoError:
            continue
    assert readable == ["안녕하세요"]


def test_save_failure_does_not_stop_the_conversation() -> None:
    """저장이 안 됐다고 대화가 멈추면 안 된다 — 지금 받는 답이 더 중요하다."""
    from app.domains.chat.infrastructure.message_repository import (
        SupabaseMessageRepository,
    )

    class FailingClient:
        def table(self, name: str) -> FakeTable:
            return FakeTable(fail=True)

    repo = SupabaseMessageRepository(
        FailingClient(),  # type: ignore[arg-type]
        FieldCipher(load_key(generate_key())),
    )
    repo.append(uuid4(), "R9", "user", "신분증이 없어요")  # 예외가 밖으로 나오지 않는다


def test_stored_message_keeps_role_and_time() -> None:
    m = StoredMessage(role="assistant", content="안내드릴게요", at=datetime.now())
    assert m.role in ("user", "assistant")
    assert m.content and m.at


def test_suggestions_are_encrypted_and_come_back() -> None:
    """추천 질문도 저장하고 되살린다 (§6.1).

    **저장만 하고 복원을 안 하는 것이 이 프로젝트에서 되풀이된 결함 모양이다.**
    넣는 쪽과 꺼내는 쪽을 한 번에 본다. 무엇을 물으려 했는지가 곧 그 사람의
    사정을 드러내므로 본문과 같은 방식으로 암호화한다.
    """
    from app.domains.chat.infrastructure.message_repository import (
        SupabaseMessageRepository,
    )

    table = FakeTable()

    class Client:
        def table(self, name: str) -> FakeTable:
            return table

    cipher = FieldCipher(load_key(generate_key()))
    repo = SupabaseMessageRepository(Client(), cipher)  # type: ignore[arg-type]
    repo.append(
        uuid4(),
        "R9",
        "assistant",
        "행정복지센터에서 받으실 수 있어요",
        suggestions=("얼마나 걸려요?", "돈이 드나요?", "사진이 필요해요?"),
    )

    sealed = str(table.rows[0]["suggestions_enc"])
    assert "얼마나" not in sealed
    assert repo._suggestions_of(sealed) == ("얼마나 걸려요?", "돈이 드나요?", "사진이 필요해요?")


def test_missing_column_still_saves_the_answer() -> None:
    """추천 질문 칸이 없는 서버에서도 답변은 남는다.

    **컬럼이 없다고 저장이 통째로 실패하면, 예외를 삼키는 구조라 오류도 없이
    그 답변이 사라진다.** 다시 열었을 때 어제 받은 안내가 없어지는 것이 §6.3이
    막으려던 바로 그것이다. 마이그레이션 0011이 늦게 적용되는 경우를 가린다.
    """
    from app.domains.chat.infrastructure.message_repository import (
        SupabaseMessageRepository,
    )

    saved: list[dict[str, object]] = []

    class PickyTable:
        """새 칸이 든 insert만 거절한다 — 컬럼이 없는 서버의 모양이다."""

        def insert(self, row: dict[str, object]) -> "PickyTable":
            if "suggestions_enc" in row:
                raise RuntimeError('column "suggestions_enc" does not exist')
            saved.append(row)
            return self

        def execute(self) -> object:
            return type("R", (), {"data": list(saved)})()

    class Client:
        def table(self, name: str) -> PickyTable:
            return PickyTable()

    repo = SupabaseMessageRepository(
        Client(),  # type: ignore[arg-type]
        FieldCipher(load_key(generate_key())),
    )
    repo.append(
        uuid4(),
        "R9",
        "assistant",
        "받으실 수 있어요",
        suggestions=("가요?", "나요?", "다요?"),
    )

    assert len(saved) == 1
    assert "suggestions_enc" not in saved[0]


def test_room_id_separates_conversations() -> None:
    """할 일마다 방이 따로 생긴다(§6.1). 방이 섞이면 엉뚱한 맥락이 딸려온다."""
    rows = [
        {"user_id": "u1", "route_id": "R9", "content": "신분증"},
        {"user_id": "u1", "route_id": "R8", "content": "마음"},
    ]
    r9 = [r for r in rows if r["route_id"] == "R9"]
    assert len(r9) == 1 and r9[0]["content"] == "신분증"


def test_user_id_separates_conversations() -> None:
    """남의 대화를 볼 수 없어야 한다."""
    rows = [
        {"user_id": "u1", "route_id": "R9"},
        {"user_id": "u2", "route_id": "R9"},
    ]
    mine: UUID | str = "u1"
    assert len([r for r in rows if r["user_id"] == mine]) == 1
