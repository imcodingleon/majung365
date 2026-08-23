"""연락처·창구 안내 — 기획서 §6.4 ③단계.

전화번호는 LLM에게 맡기지 않고 서버가 붙인다. 틀리면 헛걸음이 되는 값이다.
"""

import pytest

from app.domains.knowledge.domain.contacts import contact_of, desk_of
from app.domains.knowledge.domain.entity import Institution
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository
from app.domains.shared.hotlines import HOTLINES, KOREHA, PUBLIC_HOTLINE_NUMBERS
from app.domains.shared.routes import RouteId
from app.infrastructure.security.masking import PUBLIC_HOTLINES, mask_text


def _stub(**kw: object) -> Institution:
    base = dict(
        id="x", route_ids=(RouteId.R1,), lead_for=(), name="이름",
        summary_easy="", where="",
    )
    return Institution(**{**base, **kw})  # type: ignore[arg-type]


def test_masking_and_kb_share_one_hotline_list() -> None:
    """목록이 두 벌이면 한쪽만 갱신되는 날이 온다."""
    assert PUBLIC_HOTLINES is PUBLIC_HOTLINE_NUMBERS


def test_public_hotlines_survive_masking() -> None:
    """KB가 내보내는 번호를 사용자가 대화에 적으면 그건 개인정보가 아니라 맥락이다."""
    for number in PUBLIC_HOTLINE_NUMBERS:
        text = f"{number}에 전화했어요"
        assert number in mask_text(text), f"{number}가 마스킹에 지워졌다"


def test_every_number_names_its_org() -> None:
    """"1670-7004"만 있으면 어디에 거는지 알 수 없다."""
    for key, line in HOTLINES.items():
        assert line.org, f"{key}에 기관명이 없다"
        assert line.number, f"{key}에 번호가 없다"


def test_contact_falls_back_to_koreha() -> None:
    """매칭에 실패해도 어디든 물어볼 곳은 있어야 한다."""
    contact = contact_of(_stub(contact_key=""))
    assert contact.phone == KOREHA
    assert contact.org == "한국법무보호복지공단"


def test_hours_shown_only_when_known() -> None:
    """모르는 상담 시간을 지어내면 닫힌 시간에 걸게 된다."""
    assert contact_of(_stub(contact_key="1577-1000")).hours == "평일 09:00~18:00"
    assert contact_of(_stub(contact_key="129")).hours == ""


def test_legal_aid_shows_lunch_break() -> None:
    """132는 점심시간에 끊긴다. 모르면 서비스가 없다고 오해한다."""
    hours = contact_of(_stub(contact_key="132")).hours
    assert "11:50" in hours and "13:00" in hours


def test_desk_is_empty_when_place_is_not_fixed() -> None:
    """갈 곳이 하나로 정해지지 않는 항목은 창구 안내를 만들지 않는다."""
    assert desk_of(_stub()) is None
    desk = desk_of(_stub(desk_place="가까운 주민센터", desk_say="전입신고 하러 왔어요"))
    assert desk is not None and desk.say


def test_kb_contacts_are_all_known_numbers() -> None:
    """지부 번호가 대표번호 자리에 들어가면 사용자 지역이 어긋난다."""
    repo = JsonInstitutionRepository()
    for inst in repo.all():
        if inst.contact_key:
            assert inst.contact_key in HOTLINES, f"{inst.id}: {inst.contact_key}"


def test_bank_account_leads_with_desk_not_phone() -> None:
    """R10 통장은 대표 연락처가 없다. 은행마다 창구가 다르므로 갈 곳 안내가 정확한 답이다."""
    repo = JsonInstitutionRepository()
    lead = repo.lead_of(RouteId.R10)
    desk = desk_of(lead)
    assert desk is not None, "통장은 창구 안내가 있어야 한다"
    assert "은행" in desk.place
    assert contact_of(lead).phone == KOREHA, "보조 번호는 공단 대표번호"


def test_loader_rejects_unknown_contact(tmp_path: pytest.TempPathFactory) -> None:
    """목록에 없는 번호는 부팅에서 막는다 — 틀린 번호는 헛걸음이 된다."""
    import json
    from pathlib import Path

    repo = JsonInstitutionRepository()
    rows = []
    for i in repo.all():
        row = {
            "id": i.id,
            "route_ids": [r.value for r in i.route_ids],
            "lead_for": [r.value for r in i.lead_for],
            "name": i.name,
            "summary_easy": i.summary_easy,
            "where": i.where,
        }
        if i.id == "debt-legal-aid":
            row["contact_key"] = "02-1234-5678"  # 지부 번호를 대표번호 자리에 넣은 경우
        rows.append(row)
    path = Path(str(tmp_path)) / "institutions.json"
    path.write_text(json.dumps({"institutions": rows}, ensure_ascii=False), encoding="utf-8")

    with pytest.raises(ValueError, match="공용 목록에 없다"):
        JsonInstitutionRepository(path)
