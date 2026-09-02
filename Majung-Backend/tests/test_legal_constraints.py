"""수용 사유별 법령 제약 — 데이터와 게이트 (기획서 §9.4 · 2026-09-02 결정).

여기서 지키려는 것 셋이다.

1. **검수되지 않은 법률 정보가 화면에 나가지 않는다.** 틀린 법률 안내는 사용자를
   헛걸음시키거나 법을 어기게 만든다. 되돌릴 수 없는 종류의 실수다.
2. **제약만 담기지 않는다.** "해당하지 않는다"를 말하는 항목이 함께 있어야 앱이
   낙인을 옮기지 않는다.
3. **문장이 강해지는 방향으로 조용히 바뀌지 않는다.** 일반 사기죄만으로 계좌
   개설이 법으로 막히지는 않는다 — 그 사실이 문장에 남아 있어야 한다.
"""

import json
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

import pytest

from app.domains.knowledge.domain.legal import (
    LegalConstraint,
    LegalSource,
    constraints_for,
)
from app.domains.knowledge.infrastructure.legal_constraints_repository import (
    JsonLegalConstraintRepository,
)
from app.domains.shared.crime import CRIME_CATEGORIES
from app.domains.shared.routes import RouteId

_DATA = Path("app/domains/knowledge/data/legal_constraints.json")
_RAW = json.loads(_DATA.read_text(encoding="utf-8"))["constraints"]


# ── 실제 데이터 ────────────────────────────────────────────────────────


def test_every_route_id_is_valid() -> None:
    """결번인 R5나 오타는 여기서 걸린다."""
    for row in _RAW:
        RouteId(row["route_id"])


def test_every_category_is_known() -> None:
    for row in _RAW:
        assert set(row["categories"]) <= CRIME_CATEGORIES, row["id"]


def test_no_collection_leftovers() -> None:
    """`_`로 시작하는 필드는 수집·검수용이라 최종 파일에 남으면 안 된다.

    남아 있으면 조문 원문이 그대로 배포본에 실리고, 언젠가 누가 그것을 읽어
    화면에 낸다 — 검수를 거치지 않은 문장이 나가는 길이다.
    """
    for row in _RAW:
        leftovers = [k for k in row if k.startswith("_")]
        assert leftovers == [], f"{row['id']}에 {leftovers}가 남았다"


def test_every_entry_has_a_legal_basis() -> None:
    """근거 없는 법률 안내는 내지 않는다."""
    for row in _RAW:
        assert row["legal_basis"], row["id"]


def test_sources_point_at_public_law_sites() -> None:
    """근거 링크는 공공 도메인이어야 한다. 블로그나 로펌 글로 링크하지 않는다."""
    for row in _RAW:
        for s in row["legal_basis"]:
            host = urlparse(s["url"]).netloc
            assert host.endswith((".go.kr", ".or.kr")), f"{row['id']}: {host}"


def test_account_limit_is_not_stated_as_a_legal_ban() -> None:
    """**일반 사기죄 유죄만으로 계좌 개설이 법으로 막히지는 않는다.**

    법이 정한 제한대상자는 접근매체를 넘기거나 빌려준 사람과 보이스피싱 목적
    범죄자다. 문장이 "금지"로 강해지면 여기서 걸린다 — 사실이 아닌 체념을
    심어 주는 것이 이 기능의 가장 나쁜 실패다.
    """
    row = next(c for c in _RAW if c["id"] == "property-R10-limited-account")

    assert row["effect"] == "caution"
    assert "금지" not in row["body"]
    assert row["legal_basis"][0]["relevance"] == "applies_to_subset"


def test_employment_has_a_not_applicable_entry() -> None:
    """취업 항목에 "해당하지 않는다"를 말하는 자리가 있어야 한다.

    제약만 모으면 앱이 사용자의 짐작을 그대로 굳힌다. 인터뷰에서 나온 어려움의
    절반은 실제 제약이 아니라 제약이 있으리라는 짐작이었다.
    """
    clears = [c for c in _RAW if c["route_id"] == "R6" and c["effect"] == "clear"]

    assert clears, "R6에 clear 항목이 없다"
    assert any(
        s["relevance"] == "does_not_apply" for c in clears for s in c["legal_basis"]
    )


def test_category_free_entries_never_mention_the_reason() -> None:
    """수용 사유를 밝히지 않은 사람에게도 가는 안내는 사유를 언급하지 않는다.

    언급하면 밝히지 않은 사용자에게 관계없는 말이 나가고, 그 자체로 캐묻는
    인상이 된다.
    """
    for row in _RAW:
        if not row.get("applies_without_category"):
            continue
        text = row["headline"] + row["body"] + row["myth"] + row["what_to_do"]
        assert "수용 사유가" not in text, row["id"]


def test_screen_text_avoids_banned_words() -> None:
    """화면에 "죄목"과 "영역"을 쓰지 않는다. "수용 사유"와 "분야"다."""
    for row in _RAW:
        text = row["headline"] + row["body"] + row["myth"] + row["what_to_do"]
        assert "죄목" not in text, row["id"]
        assert "영역" not in text, row["id"]


# ── 검수 게이트 ────────────────────────────────────────────────────────


def _write(tmp_path: Path, rows: list[dict]) -> Path:
    path = tmp_path / "legal_constraints.json"
    path.write_text(
        json.dumps({"constraints": rows}, ensure_ascii=False), encoding="utf-8"
    )
    return path


def _row(**over: object) -> dict:
    base = {
        "id": "t1",
        "route_id": "R10",
        "categories": ["property"],
        "effect": "caution",
        "severity": "high",
        "headline": "제목",
        "body": "본문입니다.",
        "myth": "",
        "what_to_do": "",
        "legal_basis": [
            {
                "law": "테스트법",
                "article": "제1조",
                "article_title": "",
                "quote": "",
                "url": "https://www.law.go.kr/법령/테스트법",
                "relevance": "applies",
            }
        ],
        "verified_at": "2026-09-02",
        "reviewed_by": "AA",
        "expires_on": "2027-03-02",
    }
    base.update(over)
    return base


def test_unreviewed_entries_are_dropped(tmp_path: Path) -> None:
    """**기본값이 "안 보임"이다.** 검수자를 적지 않으면 화면에 나가지 않는다."""
    repo = JsonLegalConstraintRepository(
        _write(tmp_path, [_row(reviewed_by=""), _row(id="t2")]),
        today=date(2026, 9, 2),
    )

    assert [c.id for c in repo.all()] == ["t2"]


def test_expired_entries_are_dropped(tmp_path: Path) -> None:
    """법은 바뀌고 우리는 그걸 모른다. 확인 날짜가 지나면 안내를 멈춘다."""
    repo = JsonLegalConstraintRepository(
        _write(tmp_path, [_row(expires_on="2026-08-01")]),
        today=date(2026, 9, 2),
    )

    assert repo.all() == ()


def test_broken_values_stop_the_boot(tmp_path: Path) -> None:
    """검수 여부와 달리 값 자체가 틀린 것은 부팅에서 막는다. 우리 데이터다."""
    with pytest.raises(ValueError):
        JsonLegalConstraintRepository(_write(tmp_path, [_row(effect="maybe")]))

    with pytest.raises(ValueError):
        JsonLegalConstraintRepository(_write(tmp_path, [_row(route_id="R5")]))

    with pytest.raises(ValueError):
        JsonLegalConstraintRepository(_write(tmp_path, [_row(legal_basis=[])]))


def test_contradicting_entries_stop_the_boot(tmp_path: Path) -> None:
    """같은 사람의 같은 항목에 "막혀 있다"와 "해당하지 않는다"가 함께 갈 수 없다."""
    rows = [
        _row(id="a", effect="blocked"),
        _row(id="b", effect="clear"),
    ]

    with pytest.raises(ValueError, match="blocked와 clear"):
        JsonLegalConstraintRepository(_write(tmp_path, rows))


# ── 고르는 규칙 ────────────────────────────────────────────────────────


def _c(**over: object) -> LegalConstraint:
    base = dict(
        id="c",
        route_id="R6",
        categories=frozenset({"property"}),
        effect="caution",
        severity="high",
        headline="",
        body="",
        myth="",
        what_to_do="",
        sources=(LegalSource("법", "제1조", "", "", "https://www.law.go.kr/x", "applies"),),
        verified_at=date(2026, 9, 2),
        reviewed_by="AA",
        expires_on=date(2027, 3, 2),
    )
    base.update(over)
    return LegalConstraint(**base)  # type: ignore[arg-type]


def test_nothing_is_served_without_consent() -> None:
    """**동의하지 않으면 대부분 아무것도 나가지 않는다.** 여기가 동의 게이트다."""
    all_ = (_c(),)

    assert constraints_for(all_, None, "R6") == ()
    assert len(constraints_for(all_, "property", "R6")) == 1


def test_category_free_entries_are_served_without_consent() -> None:
    """수용 사유가 아니라 형을 살았다는 사실에 붙는 제약은 밝히지 않아도 나간다.

    경비업법 결격사유가 그 자리다 — 경비는 출소자가 가장 많이 찾는 직종이라
    동의한 사람에게만 알리면 정작 알아야 할 사람 대부분이 못 듣는다.
    """
    all_ = (_c(id="guard", applies_without_category=True),)

    assert [c.id for c in constraints_for(all_, None, "R6")] == ["guard"]


def test_heavier_entries_come_first() -> None:
    """법으로 막힌 것이 먼저고 "해당하지 않는다"가 맨 뒤다.

    무거운 것을 뒤에 두면 앞의 주의를 읽고 안심한 채 지나간다. 반대로 clear를
    앞에 두면 뒤에 오는 제약을 흘려 본다.
    """
    all_ = (
        _c(id="ok", effect="clear", severity="info"),
        _c(id="warn", effect="caution", severity="high"),
        _c(id="stop", effect="blocked", severity="high"),
    )

    assert [c.id for c in constraints_for(all_, "property", "R6")] == [
        "stop",
        "warn",
        "ok",
    ]


def test_other_routes_are_not_mixed_in() -> None:
    all_ = (_c(id="r6"), _c(id="r10", route_id="R10"))

    assert [c.id for c in constraints_for(all_, "property", "R10")] == ["r10"]
