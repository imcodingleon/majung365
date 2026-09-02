"""검수할 것을 화면에 찍는다. 읽기만 하고 아무것도 고치지 않는다.

**검수의 정의는 이 스크립트가 묻는 세 질문이다.** 조문을 읽었다는 것과 그 조문이
이 사용자 상황에 어떻게 걸리는지 판단했다는 것은 다른 일이며, 우리가 필요한 것은
뒤쪽이다.

    uv run python review_report.py            # 전체
    uv run python review_report.py <id>       # 하나만
"""

import json
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_DRAFTS = _HERE / "output" / "drafts"

_QUESTIONS = [
    (
        "이 조문이 그 대분류 전체에 적용되는가, 일부에만인가?",
        "→ relevance. '재산·경제범죄' 전체가 아니라 접근매체를 넘긴 사람만이면\n"
        "  applies_to_subset이고, body에 '법으로 금지'라고 쓸 수 없다.",
    ),
    (
        "사용자가 겪는 어려움이 이 조문 때문인가, 실무 관행 때문인가?",
        "→ 문장의 강도. 한도제한계좌는 조문이 아니라 금융회사 운영이다.\n"
        "  '법으로 막힙니다'와 '제한될 수 있습니다'가 여기서 갈린다.",
    ),
    (
        '"해당하지 않는다"고 말할 칸이 이 항목 옆에 있는가?',
        "→ 같은 지원 항목에 effect가 clear인 초안이 있는지 본다.\n"
        "  **제약만 수집되면 앱이 통념을 강화한다.**",
    ),
]

_FILL = ["effect", "severity", "headline", "body", "relevance", "reviewed_by", "review_note"]


def main() -> int:
    if not _DRAFTS.exists():
        print("초안이 없다. 먼저 collect.py를 돌린다.", file=sys.stderr)
        return 2

    only = set(sys.argv[1:])
    drafts = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(_DRAFTS.glob("*.json"))]
    if only:
        drafts = [d for d in drafts if d["id"] in only]
    if not drafts:
        print("볼 초안이 없다.", file=sys.stderr)
        return 1

    by_route: dict[str, list[dict]] = {}
    for d in drafts:
        by_route.setdefault(d["route_id"], []).append(d)

    print("=" * 72)
    print("검수 체크리스트")
    print("=" * 72)
    for i, (q, note) in enumerate(_QUESTIONS, 1):
        print(f"\n{i}. {q}")
        print(f"  {note}")

    for d in drafts:
        basis = d["legal_basis"][0]
        print("\n" + "─" * 72)
        print(f"[{d['id']}]  {d['route_id']} × {', '.join(d['categories'])}")
        print(f"  묻는 것 : {d.get('_question', '')}")
        print(f"  가설    : {d.get('_expect', '')}")
        if d.get("_hint"):
            print(f"  참고    : {d['_hint']}")
        print(f"  조문    : {basis['law']} {basis['article']} — {basis['article_title']}")
        print(f"  원문    : {len(d.get('_raw_article', '')):,}자 (파일에서 읽는다)")

        empty = [f for f in _FILL if not (d.get(f) or basis.get(f) or "")]
        if empty:
            print(f"  채울 것 : {', '.join(empty)}")
        else:
            print("  채울 것 : 없음 ✓")

        # 질문 ③을 데이터로 확인한다.
        siblings = by_route.get(d["route_id"], [])
        if d.get("effect") != "clear" and not any(s.get("effect") == "clear" for s in siblings):
            print(
                f"  ⚠ {d['route_id']}에 '해당하지 않는다'를 말하는 초안이 없다.\n"
                "    제약만 담으면 앱이 낙인을 옮긴다 — clear 항목을 함께 만들 것."
            )

    done = sum(1 for d in drafts if d.get("reviewed_by"))
    print("\n" + "=" * 72)
    print(f"검수 완료 {done} / {len(drafts)}건")
    print("초안 파일을 직접 열어 채운 뒤 merge.py --strict 로 합친다.")
    print(f"  {_DRAFTS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
