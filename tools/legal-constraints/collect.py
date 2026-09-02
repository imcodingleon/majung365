"""법제처 국가법령정보에서 조문을 가져와 검수용 초안을 만든다.

**개발자 PC에서만 돈다.** 프로덕션 서버는 검수를 마친 `legal_constraints.json`을
읽기만 하며, 법제처 인증키가 EC2에 올라가지 않는다. 백엔드 규칙이 런타임에
"별도 검색 에이전트·크롤러 구현 금지"를 정하고 있는데, 이것은 `tools/rag-crawler`와
같은 성격의 빌드 도구라 그 규칙과 부딪히지 않는다.

**MCP가 아니라 API를 직접 부른다.** 법률 MCP(`korean-law-mcp`)는 "어느 조문이 이
항목과 관련 있는가"를 사람이 탐색할 때 쓰고, 확정된 조문을 반복해서 받아오는 일은
이 스크립트가 한다 — 재현 가능하고 MCP 장애가 빌드를 막지 않는다.

**표준 라이브러리만 쓴다.** 단순 HTTP와 XML이라 의존성을 만들 이유가 없다.

    export LAW_OC=본인키          # 법제처 OPEN API 인증키(이메일 아이디 형태)
    uv run python collect.py      # → output/drafts/*.json

산출물은 커밋하지 않는다(`.gitignore`). **미검수 초안이 레포에 있으면 언젠가 누가
그것을 읽는 코드를 쓴다.**
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_TARGETS = _HERE / "targets.json"
_OUT = _HERE / "output" / "drafts"

_BASE = "https://www.law.go.kr/DRF"
# 법제처가 붙여 준 값이 아니라 사람이 정한 재확인 주기다.
# 금액과 기준은 해마다 바뀌고, 개정은 언제 올지 모른다.
_VALID_DAYS = 182


def article_code(article: str) -> str:
    """'제13조의2' → '001302'. 법제처 JO 파라미터는 조 4자리 + 항 2자리다.

    '제10조'는 항이 없으니 '001000'이다. 형식이 다르면 조회가 조용히 실패하고
    엉뚱한 조문이 오므로 여기서 막는다.
    """
    m = re.fullmatch(r"제(\d+)조(?:의(\d+))?", article.strip())
    if not m:
        raise ValueError(f"조번호 형식을 알 수 없다: {article!r}")
    return f"{int(m.group(1)):04d}{int(m.group(2) or 0):02d}"


def _get(path: str, params: dict[str, str]) -> bytes:
    url = f"{_BASE}/{path}?{urllib.parse.urlencode(params, encoding='utf-8')}"
    req = urllib.request.Request(url, headers={"User-Agent": "majung365-legal-collector"})
    with urllib.request.urlopen(req, timeout=20) as res:  # noqa: S310 — 고정 도메인
        return res.read()


# 조문 본문에 해당하는 태그. **소관부처와 부서 연락처는 담지 않는다** —
# 검수자가 읽어야 하는 것은 조문이지 법령 메타데이터가 아니고, 부서 번호가
# 초안에 섞이면 그것이 안내 문구로 옮겨 갈 길이 생긴다.
_BODY_TAGS = ("조문내용", "항내용", "호내용", "목내용")


def _text_of(root: ET.Element) -> str:
    """조문 본문만 이어 붙인다. 문서 순서를 지켜야 항과 호가 뒤섞이지 않는다."""
    return "\n".join(
        (el.text or "").strip()
        for el in root.iter()
        if el.tag in _BODY_TAGS and (el.text or "").strip()
    )


def _name_variants(law: str) -> list[str]:
    """법령명 표기 흔들림을 흡수한다.

    법제처는 "아동ㆍ청소년"처럼 아래아(U+318D)를 쓰는데 우리 문서는 가운뎃점
    (U+00B7)으로 적는다. 눈으로는 거의 같아서 **틀린 줄 모르고 조회가 실패한다.**
    공백을 뗀 형태까지 함께 시도한다.
    """
    seen: list[str] = []
    for name in (
        law,
        law.replace("·", "ㆍ"),
        law.replace("ㆍ", "·"),
        law.replace(" ", ""),
    ):
        if name not in seen:
            seen.append(name)
    return seen


def fetch_article(oc: str, law: str, article: str) -> tuple[str, str, str]:
    """(조문 제목, 본문, 조회에 성공한 법령명). 실패하면 예외를 올린다 —
    조용히 빈 초안을 만들지 않는다."""
    jo = article_code(article)
    for name in _name_variants(law):
        raw = _get(
            "lawService.do",
            {"OC": oc, "target": "law", "type": "XML", "LM": name, "JO": jo},
        )
        try:
            root = ET.fromstring(raw)
        except ET.ParseError:
            continue
        body = _text_of(root)
        if not body:
            continue
        title = ""
        for tag in ("조문제목", "조문내용"):
            node = root.find(f".//{tag}")
            if node is not None and (node.text or "").strip():
                title = (node.text or "").strip()
                break
        return title, body, name
    # **빈 응답을 '조문이 없다'로 단정하지 않는다.** 인증키가 틀렸거나
    # 법령명이 어긋났을 때도 같은 모양이 온다.
    raise RuntimeError("조문 본문이 비었다 — 인증키·법령명·조번호를 확인해야 한다")


def draft_of(target: dict, title: str, body: str, law: str) -> dict:
    """검수자가 채울 자리를 비워 둔 초안.

    **`_`로 시작하는 필드는 검수용이고 최종 파일에 남으면 안 된다.** `merge.py`가
    지우고 백엔드 테스트가 그것을 검사한다 — 남아 있으면 조문 원문이 배포본에
    실리고, 언젠가 누가 그것을 화면에 낸다.
    """
    today = date.today()
    return {
        "id": target["id"],
        "route_id": target["route_id"],
        "categories": target["categories"],
        "effect": "",
        "severity": "",
        "headline": "",
        "body": "",
        "myth": "",
        "what_to_do": "",
        "legal_basis": [
            {
                "law": law,
                "article": target["article"],
                "article_title": title,
                "quote": "",
                "url": f"https://www.law.go.kr/법령/{law.replace(' ', '')}/{target['article']}",
                "relevance": "",
            }
        ],
        "verified_at": today.isoformat(),
        "reviewed_by": "",
        "review_note": "",
        "expires_on": (today + timedelta(days=_VALID_DAYS)).isoformat(),
        "_question": target["question"],
        "_expect": target["expect"],
        "_hint": target.get("hint", ""),
        "_raw_article": body,
        "_collected_at": today.isoformat(),
    }


def main() -> int:
    oc = os.environ.get("LAW_OC", "").strip()
    if not oc:
        print(
            "LAW_OC가 없다. 법제처 OPEN API 인증키를 환경변수로 넣어야 한다.\n"
            "  https://open.law.go.kr/LSO/openApi/guideList.do 에서 신청한다.\n"
            "  PowerShell:  $env:LAW_OC=\"본인키\"",
            file=sys.stderr,
        )
        return 2

    targets = json.loads(_TARGETS.read_text(encoding="utf-8"))["targets"]
    only = sys.argv[1:] or None
    _OUT.mkdir(parents=True, exist_ok=True)

    ok = 0
    for t in targets:
        if only and t["id"] not in only:
            continue
        try:
            title, body, law = fetch_article(oc, t["law"], t["article"])
        except (urllib.error.URLError, ET.ParseError, RuntimeError, ValueError) as e:
            # **우회하지 않고 표시만 남긴다.** rag-crawler가 정한 방침 그대로다.
            print(f"  ✗ {t['id']}: {e}", file=sys.stderr)
            continue
        path = _OUT / f"{t['id']}.json"
        path.write_text(
            json.dumps(draft_of(t, title, body, law), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"  ✓ {t['id']}  ({law} {t['article']})  {len(body):,}자")
        ok += 1
        # 공공 API에 예의를 지킨다. 열 건 남짓이라 이 정도로 충분하다.
        time.sleep(0.4)

    print(f"\n초안 {ok}건을 {_OUT}에 만들었다.")
    print("다음: uv run python review_report.py 로 검수할 것을 확인한다.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
