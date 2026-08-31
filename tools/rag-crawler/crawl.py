"""마중365 RAG 근거 페이지 수집기.

공공기관 페이지는 대부분 전역 네비게이션 메뉴가 본문보다 훨씬 길기 때문에,
HTML을 통째로 긁으면 검색 품질이 떨어진다. 이 스크립트는 헤드리스 브라우저로
페이지를 열어서 화면에 실제로 보이는 텍스트만 가져오고, 사이트마다 본문 영역
선택자를 따로 지정해서 메뉴를 걷어낸다.

복지로는 본문을 탭 네 개로 나누어 놓고 탭을 눌러야 내용을 렌더링하기 때문에
별도 처리 경로(collect_bokjiro)를 둔다.

사용법:
    uv run python crawl.py                  # sources.json의 bokjiro + general 전체
    uv run python crawl.py --group bokjiro  # 특정 그룹만
    uv run python crawl.py --only 생계      # id나 이름에 '생계'가 들어간 것만
    uv run python crawl.py --headed         # 브라우저 창을 띄워서 동작 확인
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import Page, sync_playwright
from playwright.sync_api import TimeoutError as PlaywrightTimeout

BASE_DIR = Path(__file__).parent
SOURCES_PATH = BASE_DIR / "sources.json"
DEFAULT_OUT_DIR = BASE_DIR / "output"

TAB_NAMES = ["지원대상", "서비스 내용", "신청방법", "추가정보"]

# 복지로: 탭을 누르면 본문이 "<탭이름> 선택됨" 표시 뒤에 나타나고,
# 본문이 끝나는 지점에는 페이지 만족도 설문 문구가 온다.
BODY_PATTERN = re.compile(r"선택됨\s*\n(.*?)(?:\n현재 페이지의 메뉴가|\Z)", re.S)
HEADER_PATTERN = re.compile(r"내 상황에 맞는[^\n]*\n(.*?)\n목록\s*\n", re.S)
TAG_BOUNDARY = "찜하기"

# 도메인별 본문 영역 선택자. 값이 None이면 화면 전체 텍스트를 그대로 쓴다
# (그런 사이트는 메뉴가 숨겨져 있어서 화면 텍스트가 곧 본문이다).
CONTENT_SELECTORS: dict[str, str | None] = {
    "koreha.or.kr": "#contents",
    "www.koreha.or.kr": "#contents",
    "www.gov.kr": None,
    "www.corrections.go.kr": "._objHtml",
    "www.mois.go.kr": "#contents",
    "www.mohw.go.kr": "#contents",
    "www.fsc.go.kr": ".content",
    "easylaw.go.kr": "#contents",
    "www.easylaw.go.kr": "#contents",
    "slb.scourt.go.kr": "#content",
    "www.law.go.kr": "#contentBody",
    "www.lh.or.kr": "#contents",
    "www.ccrs.or.kr": "#container",
    "www.songpa.go.kr": "#contents",
    "gb.go.kr": ".bbsView",
    "www.moj.go.kr": None,
    "obank.kbstar.com": "article",
    "omoney.kbstar.com": "article",
    "www.shinhangroup.com": ".content",
    "www.payinfo.or.kr": None,
    "m.epostbank.go.kr": "#content",
    "ecfs.scourt.go.kr": ".content",
    "www.kics.go.kr": "#mf_wf_main_main_content",
    "www.nhis.or.kr": "#container",
    "www.helplaw24.go.kr": ".content",
    "www.work24.go.kr": "#contents",
}

# 자바스크립트로 화면을 조립하는 사이트는 기본 대기 시간으로는 본문이 아직 없다.
DOMAIN_WAIT_MS: dict[str, int] = {
    "www.kics.go.kr": 6_000,
}

# 자동 수집을 거부당했을 때 서버가 본문 대신 내려주는 문구.
# 이런 응답을 받으면 우회하지 않고 사람이 직접 확인하도록 표시만 남긴다.
BLOCK_MARKERS = (
    "서비스 접속이 차단되었습니다",
    "비정상 서비스 접속으로 차단되었습니다",
    "매크로 및 기타 유사 프로그램",
    "접속이 불가능합니다",
)

# 서버가 본문 대신 오류 안내를 돌려줄 때 나오는 문구.
# 이걸 본문으로 저장하면 검색에 쓰레기가 섞이므로 경고로 잡아낸다.
ERROR_MARKERS = (
    "오류로 인해 해당 페이지를 서비스 할 수 없습니다",
    "페이지를 찾을 수 없습니다",
    "요청하신 페이지를 찾을 수 없",
    "일시적인 오류가 발생",
)

# 이보다 짧으면 본문을 제대로 가져오지 못한 것으로 보고 경고한다.
MIN_BODY_LENGTH = 120


@dataclass
class Document:
    """수집한 근거 문서 한 건. RAG 인덱싱 단위이다."""

    id: str
    name: str
    source_url: str
    domain: str
    group: str
    fetched_at: str
    # 이 문서가 어느 라우트(R1~R15)의 근거인지. 한 문서가 여러 라우트에 걸칠 수 있다.
    route_ids: list[str] = field(default_factory=list)
    title: str = ""
    summary: str = ""
    department: str = ""
    tags: list[str] = field(default_factory=list)
    meta: dict[str, str] = field(default_factory=dict)
    sections: dict[str, str] = field(default_factory=dict)
    raw_header: str = ""
    content_hash: str = ""
    warnings: list[str] = field(default_factory=list)
    # 원문 자체에 있는 결함. 수집이 잘못된 것이 아니라 기관이 낸 문서가 그런 것이므로
    # 고칠 수 없고, 인용할 때 조심하라고 표시만 남긴다. sources.json에서 사람이 적는다.
    caveats: list[str] = field(default_factory=list)

    def body_length(self) -> int:
        return sum(len(text) for text in self.sections.values())

    def finalize(self) -> None:
        joined = "\n".join(self.sections[key] for key in sorted(self.sections))
        self.content_hash = hashlib.sha256(joined.encode("utf-8")).hexdigest()[:16]


def page_text(page: Page) -> str:
    """화면에 보이는 텍스트를 가져온다. 본문을 프레임에 넣어둔 사이트도 처리한다."""
    text = page.evaluate("() => document.body.innerText").strip()
    if len(text) >= MIN_BODY_LENGTH:
        return text

    # payinfo처럼 본문이 프레임 안에 있는 사이트는 가장 긴 프레임을 본문으로 본다.
    candidates: list[str] = []
    for frame in page.frames[1:]:
        try:
            candidates.append(frame.evaluate("() => document.body.innerText").strip())
        except PlaywrightError:
            continue
    if candidates:
        longest = max(candidates, key=len)
        if len(longest) > len(text):
            return longest
    return text


def collect_general(page: Page, source: dict[str, Any], wait_ms: int) -> Document:
    domain = source["domain"]
    page.goto(source["url"], wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_timeout(max(wait_ms, DOMAIN_WAIT_MS.get(domain, 0)))

    selector = CONTENT_SELECTORS.get(domain, "")
    body = ""
    warnings: list[str] = []

    if selector:
        locator = page.locator(selector)
        parts = []
        for index in range(locator.count()):
            try:
                parts.append(locator.nth(index).inner_text(timeout=5_000).strip())
            except (PlaywrightError, PlaywrightTimeout):
                continue
        body = "\n".join(part for part in parts if part).strip()
        if not body:
            warnings.append(f"본문 선택자 {selector}가 비어 있어 화면 전체 텍스트로 대체했습니다.")
    elif selector == "":
        warnings.append(f"{domain} 본문 선택자가 등록되어 있지 않아 화면 전체 텍스트를 씁니다.")

    if not body:
        body = page_text(page)

    document = Document(
        id=source["id"],
        name=source["name"],
        source_url=source["url"],
        domain=domain,
        group="general",
        fetched_at=datetime.now(UTC).isoformat(timespec="seconds"),
        route_ids=list(source.get("route_ids", [])),
        caveats=list(source.get("caveats", [])),
        title=page.title().strip(),
        sections={"본문": body} if body else {},
        warnings=warnings,
    )
    if any(marker in body for marker in BLOCK_MARKERS):
        document.warnings.append(
            "서버가 자동 수집을 차단했습니다. 우회하지 않고 사람이 직접 확인해야 합니다."
        )
    elif any(marker in body for marker in ERROR_MARKERS):
        document.warnings.append(
            "서버가 본문 대신 오류 안내를 돌려줬습니다. URL이 바뀌었는지 확인해야 합니다."
        )
    elif len(body) < MIN_BODY_LENGTH:
        document.warnings.append(f"본문이 {len(body)}자뿐입니다. 선택자를 확인해야 합니다.")
    document.finalize()
    return document


def parse_bokjiro_header(body_text: str) -> tuple[str, str, str, list[str], dict[str, str], str]:
    """복지로 상단의 제도명·요약·담당부처·분류 태그·요약표를 최선을 다해 뽑아낸다.

    복지로가 화면 구조를 바꾸더라도 원문(raw_header)은 그대로 남기므로,
    파싱이 어긋나도 정보 자체가 사라지지는 않는다.
    """
    match = HEADER_PATTERN.search(body_text)
    if not match:
        return "", "", "", [], {}, ""

    raw = match.group(1).strip()
    lines = [line.strip() for line in raw.split("\n") if line.strip()]

    title = ""
    summary = ""
    department = ""
    tags: list[str] = []
    meta: dict[str, str] = {}

    # 분류 태그는 상단 안내 문구와 찜하기 버튼 사이에 놓여 있고,
    # 제도명은 마지막 찜하기 버튼 바로 다음 줄에 온다.
    if TAG_BOUNDARY in lines:
        first = lines.index(TAG_BOUNDARY)
        last = len(lines) - 1 - lines[::-1].index(TAG_BOUNDARY)
        tags = lines[:first]
        if last + 1 < len(lines):
            title = lines[last + 1]
    elif lines:
        title = lines[0]

    for index, line in enumerate(lines):
        if line == "담당부처" and index + 1 < len(lines):
            department = lines[index + 1]
            # 담당부처 바로 앞줄이 제도를 한 문장으로 설명한 요약이다.
            if index >= 1:
                summary = lines[index - 1]
            break

    # "복지서비스 상세" 뒤에는 라벨 4개와 값 4개가 순서대로 이어진다.
    if "복지서비스 상세" in lines:
        start = lines.index("복지서비스 상세") + 1
        rest = lines[start:]
        labels = ["기준연도", "문의처", "지원주기", "제공유형"]
        found = [label for label in labels if label in rest]
        if found:
            value_start = rest.index(found[-1]) + 1
            values = rest[value_start : value_start + len(found)]
            meta = dict(zip(found, values, strict=False))

    return title, summary, department, tags, meta, raw


def collect_bokjiro(page: Page, source: dict[str, Any], wait_ms: int) -> Document:
    page.goto(source["url"], wait_until="networkidle", timeout=60_000)
    page.wait_for_timeout(wait_ms)

    body_text = page.evaluate("() => document.body.innerText")
    title, summary, department, tags, meta, raw_header = parse_bokjiro_header(body_text)

    sections: dict[str, str] = {}
    warnings: list[str] = []
    for tab_name in TAB_NAMES:
        locator = page.get_by_text(tab_name, exact=True)
        if locator.count() == 0:
            warnings.append(f"{tab_name} 탭을 찾지 못했습니다.")
            continue
        try:
            locator.first.click()
        except (PlaywrightError, PlaywrightTimeout) as exc:
            warnings.append(f"{tab_name} 탭 클릭 실패: {str(exc).splitlines()[0]}")
            continue
        page.wait_for_timeout(wait_ms)
        match = BODY_PATTERN.search(page.evaluate("() => document.body.innerText"))
        text = match.group(1).strip() if match else ""
        if text:
            sections[tab_name] = text
        else:
            warnings.append(f"{tab_name} 본문이 비어 있습니다.")

    document = Document(
        id=source["id"],
        name=source["name"],
        source_url=source["url"],
        domain="www.bokjiro.go.kr",
        group="bokjiro",
        fetched_at=datetime.now(UTC).isoformat(timespec="seconds"),
        route_ids=list(source.get("route_ids", [])),
        caveats=list(source.get("caveats", [])),
        title=title,
        summary=summary,
        department=department,
        tags=tags,
        meta=meta,
        sections=sections,
        raw_header=raw_header,
        warnings=warnings,
    )
    document.finalize()
    return document


def main() -> int:
    parser = argparse.ArgumentParser(description="마중365 RAG 근거 페이지 수집기")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_DIR, help="저장 위치")
    parser.add_argument("--group", default="", help="bokjiro 또는 general 중 하나만 수집")
    parser.add_argument("--only", default="", help="id나 이름에 이 문자열이 들어간 문서만 수집")
    parser.add_argument("--delay", type=float, default=1.5, help="페이지 사이 대기 시간(초)")
    parser.add_argument("--wait-ms", type=int, default=1200, help="렌더링 대기 시간(밀리초)")
    parser.add_argument("--retry", type=int, default=2, help="페이지당 시도 횟수")
    parser.add_argument("--headed", action="store_true", help="브라우저 창을 띄운다")
    args = parser.parse_args()

    # 윈도우 콘솔 기본 코드페이지에서 한글이 깨지지 않도록 출력 인코딩을 맞춘다.
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")

    sources = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))
    jobs: list[tuple[str, dict[str, Any]]] = []
    for group in ("bokjiro", "general"):
        if args.group and args.group != group:
            continue
        for source in sources.get(group, []):
            if args.only and args.only not in source["id"] and args.only not in source["name"]:
                continue
            jobs.append((group, source))

    if not jobs:
        print("수집할 대상이 없습니다.", file=sys.stderr)
        return 1

    args.out.mkdir(parents=True, exist_ok=True)
    documents: list[Document] = []
    failures: list[tuple[str, str]] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=not args.headed)
        context = browser.new_context(viewport={"width": 1400, "height": 2000})
        for index, (group, source) in enumerate(jobs):
            print(f"[{index + 1}/{len(jobs)}] {source['name']}")
            collect = collect_bokjiro if group == "bokjiro" else collect_general

            document = None
            last_error = ""
            # 공공기관 서버가 간헐적으로 느리게 응답하므로 정해진 횟수만큼 다시 시도한다.
            for attempt in range(1, args.retry + 1):
                page = context.new_page()
                try:
                    document = collect(page, source, args.wait_ms)
                    break
                except (PlaywrightError, PlaywrightTimeout) as exc:
                    last_error = str(exc).splitlines()[0][:120]
                    print(f"    [{attempt}차 실패] {last_error}", file=sys.stderr)
                    if attempt < args.retry:
                        time.sleep(args.delay)
                finally:
                    page.close()

            if document is None:
                failures.append((source["name"], last_error))
                continue

            group_dir = args.out / group
            group_dir.mkdir(parents=True, exist_ok=True)
            path = group_dir / f"{document.id}.json"
            path.write_text(
                json.dumps(asdict(document), ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"    본문 {document.body_length()}자 → {group}/{path.name}")
            for warning in document.warnings:
                print(f"    [경고] {warning}", file=sys.stderr)
            documents.append(document)

            if index < len(jobs) - 1:
                time.sleep(args.delay)
        browser.close()

    if documents:
        # 묶음 파일은 이번 실행 결과가 아니라 **저장된 문서 전체**로 다시 만든다.
        # 이번 실행분만 쓰면 --only로 일부만 돌렸을 때 나머지가 조용히 사라진다.
        bundle = args.out / "documents.jsonl"
        stored: list[dict[str, Any]] = []
        excluded: list[tuple[str, str]] = []
        for path in sorted(args.out.glob("*/*.json")):
            try:
                row = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                print(f"    [경고] 읽을 수 없는 파일을 건너뜁니다: {path.name}", file=sys.stderr)
                continue

            # 차단 안내문과 오류 페이지는 **묶음에서 뺀다.** 경고만 남기고 두면
            # RAG가 그것을 근거로 잡아 화면에 "서비스 접속이 차단되었습니다"가 나간다.
            # 개별 파일은 남겨서 나중에 차단이 풀렸는지 다시 확인할 수 있게 한다.
            reason = next(
                (w for w in row.get("warnings", []) if "차단" in w or "오류 안내" in w), ""
            )
            if reason:
                excluded.append((row["name"], reason))
                continue
            stored.append(row)

        with bundle.open("w", encoding="utf-8") as handle:
            for row in stored:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")

        if excluded:
            print(f"묶음에서 제외한 문서 {len(excluded)}건 (본문 대신 안내문이 담겨 있음):")
            for name, reason in excluded:
                print(f"  - {name}: {reason[:40]}")
        blocked = [d for d in documents if any("차단" in w for w in d.warnings)]
        thin = [
            d
            for d in documents
            if d not in blocked and d.body_length() < MIN_BODY_LENGTH
        ]
        print(f"\n{len(documents)}건 수집 완료. 묶음 파일은 저장된 {len(stored)}건 전체 → {bundle}")
        if blocked:
            print(f"서버가 자동 수집을 차단한 문서 {len(blocked)}건 (사람이 직접 확인해야 합니다):")
            for document in blocked:
                print(f"  - {document.name} ({document.domain})")
        flagged = [d for d in documents if d.caveats]
        if flagged:
            print(f"원문에 알려진 결함이 있는 문서 {len(flagged)}건 (인용 시 주의):")
            for document in flagged:
                print(f"  - {document.name}: {document.caveats[0]}")
        if thin:
            print(f"본문이 짧아 확인이 필요한 문서 {len(thin)}건:")
            for document in thin:
                print(f"  - {document.name} ({document.body_length()}자, {document.domain})")

    if failures:
        print(f"\n실패 {len(failures)}건:", file=sys.stderr)
        for name, reason in failures:
            print(f"  - {name}: {reason}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
