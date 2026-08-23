"""고른 답을 안내 문장에 채우는 규칙 (§4.1 · intake-questions.md Q2-1)."""

import json
from pathlib import Path

from app.domains.knowledge.domain.purpose import (
    _REASON_DOC,
    docs_with_purpose,
    expense_purpose,
    say_with_purpose,
)
from app.domains.shared.routes import RouteId

_DATA = Path(__file__).resolve().parent.parent / "app" / "domains" / "knowledge" / "data"


def test_reason_doc_matches_the_knowledge_base() -> None:
    """치환은 **글자까지 같아야** 걸린다. KB 문구를 고치면 이 테스트가 먼저 깨진다 —
    조용히 안 걸리면 사용자는 여전히 "돈이 필요한 이유를 보여주는 서류"를 본다."""
    raw = json.loads((_DATA / "institutions.json").read_text(encoding="utf-8"))
    docs = [d for i in raw["institutions"] if "R2" in i.get("route_ids", []) for d in i["docs"]]
    assert _REASON_DOC in docs


def test_purpose_only_applies_to_emergency_support() -> None:
    """R2 말고는 채울 자리가 없다."""
    answers = {"emergencyExpenseType": "MEDICAL_EXPENSE"}
    assert expense_purpose(RouteId.R2, answers) == "병원비"
    assert expense_purpose(RouteId.R1, answers) is None


def test_no_purpose_when_nothing_to_fill() -> None:
    """"지금은 필요 없어요"·"잘 모르겠어요"는 채울 용도가 아니다. 원문을 그대로 둔다."""
    assert expense_purpose(RouteId.R2, {"emergencyExpenseType": "NOT_NEEDED"}) is None
    assert expense_purpose(RouteId.R2, {"emergencyExpenseType": "UNKNOWN"}) is None
    assert expense_purpose(RouteId.R2, {}) is None


def test_docs_fill_only_the_reason_slot() -> None:
    """이유 자리만 채우고 나머지 준비물은 건드리지 않는다."""
    docs = ("주민등록등본", _REASON_DOC, "통장 사본")
    filled = docs_with_purpose(docs, "병원비")
    assert filled == ("주민등록등본", "병원비가 필요한 것을 보여주는 서류", "통장 사본")
    assert docs_with_purpose(docs, None) == docs


def test_subject_particle_follows_the_last_syllable() -> None:
    """조사가 틀리면 기계가 쓴 문장으로 읽힌다."""
    assert docs_with_purpose((_REASON_DOC,), "월세나 방값")[0].startswith("월세나 방값이 ")
    assert docs_with_purpose((_REASON_DOC,), "아이 학비")[0].startswith("아이 학비가 ")


def test_desk_say_gets_the_purpose_in_front() -> None:
    """창구에서는 한 문장만 말하면 된다. 그 문장에 용도가 들어간다."""
    assert (
        say_with_purpose("긴급복지지원 신청하러 왔어요", "병원비")
        == "병원비 때문에 긴급복지지원 신청하러 왔어요"
    )


def test_desk_say_stays_empty_when_there_is_no_desk() -> None:
    """창구 안내가 없는 기관에는 붙일 자리도 없다. 빈 문장을 만들어 내지 않는다."""
    assert say_with_purpose("", "병원비") == ""
    assert say_with_purpose("긴급복지지원 신청하러 왔어요", None) == "긴급복지지원 신청하러 왔어요"
