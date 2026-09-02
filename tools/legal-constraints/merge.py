"""검수를 마친 초안을 백엔드의 `legal_constraints.json`으로 합친다.

**검수용 필드를 지운다.** `_`로 시작하는 것은 조문 원문과 가설이라 배포본에 남으면
안 된다 — 남아 있으면 언젠가 누가 그것을 읽어 화면에 내고, 그 문장은 검수를 거치지
않은 것이다.

    uv run python merge.py            # 검수된 것만 합치고 나머지는 알린다
    uv run python merge.py --strict   # 하나라도 미검수면 아무것도 안 하고 exit 1
"""

import json
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_DRAFTS = _HERE / "output" / "drafts"
_TARGET = (
    _HERE.parent.parent
    / "Majung-Backend"
    / "app"
    / "domains"
    / "knowledge"
    / "data"
    / "legal_constraints.json"
)

_REQUIRED = ("effect", "severity", "headline", "body", "reviewed_by")


def _problems(d: dict) -> list[str]:
    out = [f for f in _REQUIRED if not str(d.get(f, "")).strip()]
    if not d.get("legal_basis"):
        out.append("legal_basis")
    for b in d.get("legal_basis", []):
        if not str(b.get("relevance", "")).strip():
            out.append(f"legal_basis[{b.get('article', '?')}].relevance")
    return out


def _clean(d: dict) -> dict:
    """검수용 필드를 털어낸다. 순서는 사람이 읽기 좋게 고정한다."""
    keep = {k: v for k, v in d.items() if not k.startswith("_")}
    order = [
        "id", "route_id", "categories", "applies_without_category",
        "effect", "severity", "headline", "body", "myth", "what_to_do",
        "legal_basis", "verified_at", "reviewed_by", "review_note", "expires_on",
    ]
    ordered = {k: keep[k] for k in order if k in keep}
    ordered.update({k: v for k, v in keep.items() if k not in ordered})
    return ordered


def main() -> int:
    strict = "--strict" in sys.argv
    if not _DRAFTS.exists():
        print("초안이 없다. 먼저 collect.py를 돌린다.", file=sys.stderr)
        return 2

    drafts = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(_DRAFTS.glob("*.json"))]
    ready, pending = [], []
    for d in drafts:
        (pending if _problems(d) else ready).append(d)

    for d in pending:
        print(f"  ✗ {d['id']}: {', '.join(_problems(d))}가 비었다", file=sys.stderr)

    if strict and pending:
        print(f"\n미검수 {len(pending)}건이 있어 합치지 않는다.", file=sys.stderr)
        return 1
    if not ready:
        print("합칠 것이 없다.", file=sys.stderr)
        return 1

    # **기존 _meta를 지키고 항목만 갈아끼운다.** 그 블록은 사람이 쓴 설명이라
    # 수집기가 다시 만들 수 없다.
    existing = json.loads(_TARGET.read_text(encoding="utf-8")) if _TARGET.exists() else {}
    merged = {
        "_meta": existing.get("_meta", {}),
        "constraints": [_clean(d) for d in ready],
    }
    _TARGET.write_text(
        json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"\n{len(ready)}건을 합쳤다 → {_TARGET}")
    if pending:
        print(f"미검수 {len(pending)}건은 빠졌다. 로더도 그것을 버린다.")
    print("다음: 백엔드에서 uv run pytest tests/test_legal_constraints.py 로 확인한다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
