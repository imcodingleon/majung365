"""출처·확인 날짜 표시 — 기획서 §6.4.

확인 날짜의 주어가 누구인지가 이 기능의 전부다. "2026년 8월 22일 기준"이라고 쓰면
기관이 그날 확인했다는 뜻으로 읽히는데, 실제로는 마중365가 수집한 날짜다.
"""

from app.domains.knowledge.domain.sources import verified_note
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository


def test_note_names_who_verified() -> None:
    """기관이 갱신한 날이 아니라 우리가 확인한 날임이 문장에 드러나야 한다."""
    note = verified_note("2026-08-22")
    assert note == "마중365가 2026년 8월 22일에 확인한 내용이에요."
    assert "기준" not in note, "'기준'은 기관이 그날 확인했다는 뜻으로 읽힌다"


def test_note_is_empty_without_a_date() -> None:
    """확인하지 않았으면 표시하지 않는다. 없는 날짜를 지어내면 최신인 줄 알고 헛걸음한다."""
    assert verified_note("") == ""


def test_broken_date_does_not_raise() -> None:
    """형식이 깨져도 안내가 멈추면 안 된다. 잘못된 날짜를 보이는 것보다 안 보이는 편이 낫다."""
    for bad in ("2026-13-99", "어제", "2026/08/22", "곧"):
        assert verified_note(bad) == ""


def test_compact_iso_still_works() -> None:
    """구분자 없는 20260822도 ISO 형식이라 날짜로 읽힌다 — 표시를 포기할 이유가 없다."""
    assert verified_note("20260822") == verified_note("2026-08-22")


def test_kb_verified_dates_are_iso() -> None:
    """형식이 어긋난 값이 데이터에 들어오면 화면에서 조용히 사라진다 — 여기서 먼저 잡는다."""
    repo = JsonInstitutionRepository()
    for inst in repo.all():
        if inst.verified_at:
            assert verified_note(inst.verified_at), f"{inst.id}의 확인 날짜 형식이 깨졌다"


def test_verified_institutions_have_sources() -> None:
    """확인 날짜만 있고 출처가 없으면 사용자가 근거를 볼 방법이 없다."""
    repo = JsonInstitutionRepository()
    for inst in repo.all():
        if inst.verified_at:
            assert inst.source_urls, f"{inst.id}에 확인 날짜만 있고 출처가 없다"
        if inst.source_urls:
            assert inst.verified_at, f"{inst.id}에 출처만 있고 확인 날짜가 없다"


def test_unverified_institutions_show_nothing() -> None:
    """근거를 확보하지 못한 제도는 출처도 날짜도 비운다 — 지어내지 않는다.

    지금은 18건 전부 근거가 있어 이 목록이 비어 있다. 새 제도가 근거 없이 들어오면
    그때 이 규칙이 지켜지는지 여기서 확인된다.
    """
    repo = JsonInstitutionRepository()
    for inst in repo.all():
        if inst.verified_at:
            continue
        assert not inst.source_urls
        assert verified_note(inst.verified_at) == ""


def test_every_institution_has_a_source() -> None:
    """근거 없는 안내가 화면에 나가지 않는다. 새 제도를 근거 없이 넣으면 여기서 걸린다."""
    repo = JsonInstitutionRepository()
    missing = [i.id for i in repo.all() if not i.source_urls]
    assert not missing, f"출처가 없는 제도: {missing}"
