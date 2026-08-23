"""위치 기반 기관 안내(§5.4)에 쓸 기관 목록을 RAG 크롤러 산출물에서 뽑는다.

수집기가 이미 받아둔 문서의 표를 파싱하므로 이 스크립트는 네트워크를 쓰지 않는다.
원문이 갱신되면 크롤러를 다시 돌린 뒤 이 스크립트를 실행한다.

    python tools/build-institutions.py

산출물은 두 개다.
  Majung-Backend/app/domains/centers/data/koreha_branches.json
  Majung-Backend/app/domains/centers/data/mental_health_centers.json

**출처와 확인 날짜를 함께 넣는다.** 제도 안내와 같은 이유다. 주소와 전화번호는 틀리면
헛걸음이 되는 값이라 언제 확인한 것인지가 드러나야 한다 (§6.4).
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CRAWLER = ROOT / "tools" / "rag-crawler" / "output" / "general"
# 데이터는 백엔드가 들고 있는다. 프론트는 시군구만 보내고 결과를 받는다 (§5.4).
OUT_DIR = ROOT / "Majung-Backend" / "app" / "domains" / "centers" / "data"

# 광역시도 표기가 원문마다 다르다("경북"·"경상북도"). 화면에 쓸 짧은 이름으로 맞춘다.
SIDO_NORM = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천",
    "광주광역시": "광주", "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종",
    "경기도": "경기", "강원도": "강원", "강원특별자치도": "강원",
    "충청북도": "충북", "충청남도": "충남",
    "전라북도": "전북", "전북특별자치도": "전북", "전라남도": "전남",
    "경상북도": "경북", "경상남도": "경남",
    "제주특별자치도": "제주", "제주도": "제주",
}

PHONE_RE = re.compile(r"^(0\d{1,2}-\d{3,4}-\d{4}|1\d{3}-\d{4})$")

# 시군구 칸에 대상이나 권역 구분이 붙어 있는 경우가 있다.
#   "수원시(노인)" · "고양시 아동청소년" · "창원시 마산"
# 기기에서 얻은 시군구와 맞추려면 기본 이름만 떼어내야 한다.
DISTRICT_RE = re.compile(r"^([가-힣]+[시군구])\s*(.*)$")


def split_district(raw: str, address: str) -> tuple[str, str]:
    """시군구 칸에서 기본 이름과 구분을 뽑는다. 구분이 없으면 빈 문자열이다.

    **시군구 칸과 주소 어느 쪽도 단독으로는 믿을 수 없다.**
    시군구 칸에 센터 이름이 들어간 행이 셋 있고("삼산"·"아산청년 마음건강센터"),
    주소 쪽은 띄어쓰기가 빠지거나("마포구성산로4길") 시군구가 아예 없는 행이 열하나 있다.
    그래서 시군구 칸을 먼저 보고, 안 되면 주소 첫 어절로 넘어간다.
    """
    m = DISTRICT_RE.match(raw.strip())
    if m:
        base, rest = m.group(1), m.group(2).strip()
        return base, rest.strip("()（） ").strip()

    head = address.split()[0] if address.split() else ""
    if re.fullmatch(r"[가-힣]+[시군구]", head):
        # 시군구 칸에 있던 값은 센터를 구별하는 이름이므로 구분으로 살린다.
        return head, raw.strip()

    raise ValueError(f"시군구를 알아볼 수 없음: 칸={raw!r} 주소={address!r}")


def load(name: str) -> dict:
    return json.loads((CRAWLER / name).read_text(encoding="utf-8"))


def rows_of(doc: dict) -> list[str]:
    """본문에서 표 행만 고른다. 크롤러가 셀을 탭으로 남긴다."""
    return [line for line in doc["sections"]["본문"].split("\n") if "\t" in line]


def build_branches() -> tuple[list[dict], str, str]:
    """한국법무보호복지공단 기관 목록. 지부는 광역 단위라 시군구까지 필요하지 않다."""
    doc = load("공단_기관_찾기.json")
    addr_re = re.compile(r"^우\)(\d{5})\s+(.+)$")

    def kind_of(name: str) -> str:
        if name.endswith("지부"):
            return "branch"
        if name.endswith("지소"):
            return "branch"
        if "허그상담소" in name:
            return "hug"
        if name.endswith("교육원"):
            return "training"
        return "head"

    out: list[dict] = []
    for line in rows_of(doc)[1:]:
        cols = [c.strip() for c in line.split("\t")]
        if len(cols) < 3:
            raise ValueError(f"열이 모자란 행: {line!r}")
        name, addr_raw, phone = cols[0], cols[1], cols[2]
        m = addr_re.match(addr_raw)
        if not m:
            raise ValueError(f"주소 형식이 다른 행: {addr_raw!r}")
        address = m.group(2)
        head = address.split()[0]
        if not PHONE_RE.match(phone):
            raise ValueError(f"전화번호 형식이 다른 행: {name} {phone!r}")
        out.append({
            "name": name,
            "kind": kind_of(name),
            "sido": SIDO_NORM.get(head, head),
            "address": address,
            "phone": phone,
        })
    return out, doc["source_url"], doc["fetched_at"][:10]


def build_centers() -> tuple[list[dict], str, str]:
    """기초정신건강복지센터. 애초에 시군구 단위 기관이라 시군구만 알면 짚어줄 수 있다."""
    doc = load("보건복지부_기초정신건강복지센터.json")
    # 시도 행은 "서울 (25)"처럼 개수가 붙어 있고 그 행에만 시도 칸이 있다. 이후 행은 이어받는다.
    sido_re = re.compile(r"^(\S+)\s*\(\d+\)$")

    out: list[dict] = []
    current: str | None = None
    for line in rows_of(doc)[1:]:
        cols = [c.strip() for c in line.split("\t")]
        m = sido_re.match(cols[0])
        if m:
            current = m.group(1)
            cols = cols[1:]
        if current is None:
            raise ValueError(f"시도를 알 수 없는 행: {line!r}")
        if len(cols) < 5:
            raise ValueError(f"열이 모자란 행: {line!r}")
        district, _run_type, _opened, address, phone = cols[:5]
        if not PHONE_RE.match(phone):
            raise ValueError(f"전화번호 형식이 다른 행: {district} {phone!r}")
        base, note = split_district(district, address)
        out.append({
            "sido": current,
            # 매칭에 쓰는 시군구명. 기기에서 얻은 시군구와 이 값을 맞춘다.
            "district": base,
            # 같은 시군구에 여러 센터가 있을 때의 구분. 없으면 넣지 않는다.
            **({"note": note} if note else {}),
            "address": address,
            "phone": phone,
        })

    # 한 시군구에 여러 센터가 있는 것은 정상이다. 구분까지 같으면 원문이 잘못된 것이다.
    dup = [
        k for k, v in Counter((c["sido"], c["district"], c.get("note", "")) for c in out).items()
        if v > 1
    ]
    if dup:
        raise ValueError(f"같은 센터가 두 번 나옴: {dup}")
    return out, doc["source_url"], doc["fetched_at"][:10]


def write(filename: str, items: list[dict], source_url: str, checked_at: str) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "_meta": {
            "source_url": source_url,
            # 마중365가 확인한 날짜다. 기관이 갱신한 날짜가 아니다 (§6.4).
            "checked_at": checked_at,
            "generated_by": "tools/build-institutions.py",
            "count": len(items),
        },
        "items": items,
    }
    (OUT_DIR / filename).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"{filename}: {len(items)}건 (확인일 {checked_at})")


def write_regions(centers: list[dict]) -> None:
    """지역 선택지 목록을 프론트에 둔다.

    위치 허가를 거부한 사용자가 지역을 직접 고르는 자리에 쓴다(§5.4-5). **기관 정보가
    아니라 선택지 이름뿐이라** 주소·전화번호를 들고 있는 백엔드 데이터와 성격이 다르다.
    고르는 순간 목록이 있어야 하므로 화면 쪽에 둔다.

    센터가 있는 시군구만 담는다. 없는 지역은 "우리 지역이 없어요"로 받아 광역 지부만
    안내한다.
    """
    by_sido: dict[str, list[str]] = {}
    for c in centers:
        by_sido.setdefault(c["sido"], [])
        if c["district"] not in by_sido[c["sido"]]:
            by_sido[c["sido"]].append(c["district"])

    out_dir = ROOT / "Majung-Frontend" / "src" / "features" / "institutions" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "_meta": {"generated_by": "tools/build-institutions.py"},
        "regions": [
            {"sido": sido, "districts": sorted(names)} for sido, names in sorted(by_sido.items())
        ],
    }
    (out_dir / "regions.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    total = sum(len(v) for v in by_sido.values())
    print(f"regions.json: 시도 {len(by_sido)} · 시군구 {total}")


def main() -> None:
    branches, b_url, b_date = build_branches()
    centers, c_url, c_date = build_centers()
    write("koreha_branches.json", branches, b_url, b_date)
    write("mental_health_centers.json", centers, c_url, c_date)
    write_regions(centers)

    kinds = Counter(b["kind"] for b in branches)
    print("  공단 기관 종류:", dict(kinds))
    print("  센터 시도 수:", len({c["sido"] for c in centers}))


if __name__ == "__main__":
    main()
