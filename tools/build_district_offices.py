"""행정안전부 읍면동 하부행정기관 현황 CSV를 백엔드 데이터 JSON으로 바꾼다.

주민센터·행정복지센터의 주소를 시군구 단위로 묶어서 내보낸다. 위치 기반 안내가
시군구까지만 알기 때문에(좌표를 서버로 보내지 않는 설계), 사용자에게 그 시군구의
읍면동 목록을 보여주고 자기 동네를 고르게 하는 것이 이 데이터의 쓰임이다.

원본에 전화번호는 없다. 창구 안내가 "가서 이렇게 말하면 돼요" 형태이므로 주소만으로
충분하고, 전화가 필요하면 정부민원안내콜센터 110으로 넘긴다.

사용법:
    python tools/build_district_offices.py --csv <원본.csv> --out <출력.json>
    python tools/build_district_offices.py --csv <원본.csv> --out <출력.json> --sido 서울 경기
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
from collections import Counter
from pathlib import Path

# 원본 파일이 BOM 있는 UTF-8로 오지만, 공공데이터는 CP949로 바뀌어 배포되는 일이 잦다.
ENCODINGS = ("utf-8-sig", "cp949", "utf-8")

REQUIRED_COLUMNS = ("시도", "시군구", "읍면동", "우편번호", "주소")

# 읍면동 이름 끝에 붙는 기관 종류. 화면에서 종류를 따로 보여줄 때 쓴다.
OFFICE_KINDS = ("행정복지센터", "주민센터", "사무소", "출장소")


def read_rows(csv_path: Path) -> list[dict[str, str]]:
    raw = csv_path.read_bytes()
    for encoding in ENCODINGS:
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise SystemExit(f"인코딩을 알 수 없습니다: {csv_path}")

    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        raise SystemExit("빈 파일입니다.")

    missing = [c for c in REQUIRED_COLUMNS if c not in rows[0]]
    if missing:
        raise SystemExit(f"필요한 열이 없습니다: {missing} / 실제 열: {list(rows[0])}")
    return rows


def normalize_zipcode(raw: str) -> str:
    """우편번호 앞의 0을 되살린다.

    한국 우편번호는 5자리인데 원본 CSV의 427건이 4자리로 들어온다. 엑셀이 우편번호를
    숫자로 다루면서 앞자리 0이 날아간 것이고, 그 427건은 모두 서울이다(서울은 0으로 시작).
    그대로 두면 사용자가 우편번호를 잘못 쓰게 되므로 5자리로 채운다.
    """
    digits = raw.strip()
    if not digits:
        return ""
    return digits.zfill(5)


def split_kind(name: str) -> tuple[str, str]:
    """'개포1동 주민센터' → ('개포1동', '주민센터').

    일부 행은 '북경주 행정복지센터(안강읍)'처럼 기관 종류 뒤에 괄호가 붙어 있다.
    괄호는 관할이나 청사 상태를 알려주는 정보이므로 이름에 남기고, 종류만 따로 뽑는다.
    """
    base, paren = name, ""
    match = re.match(r"^(.*?)(\([^()]*\))\s*$", name)
    if match:
        base, paren = match.group(1).strip(), match.group(2)

    for kind in OFFICE_KINDS:
        if base.endswith(kind):
            dong = base[: -len(kind)].strip()
            return f"{dong} {paren}".strip() if paren else dong, kind
    return name, ""


def main() -> int:
    parser = argparse.ArgumentParser(description="읍면동 하부행정기관 CSV → JSON")
    parser.add_argument("--csv", type=Path, required=True, help="원본 CSV 경로")
    parser.add_argument("--out", type=Path, required=True, help="출력 JSON 경로")
    parser.add_argument("--sido", nargs="*", default=None, help="시도를 지정하면 그것만 담는다")
    args = parser.parse_args()

    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")

    rows = read_rows(args.csv)
    offices: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    duplicates = 0

    for row in rows:
        sido = row["시도"].strip()
        if args.sido and sido not in args.sido:
            continue

        sigungu = row["시군구"].strip()
        # 원본 일부 행의 이름 끝에 공백이 붙어 있어 그대로 두면 같은 기관이 둘로 갈린다.
        full_name = re.sub(r"\s+", " ", row["읍면동"]).strip()
        dong, kind = split_kind(full_name)

        key = (sido, sigungu, full_name)
        if key in seen:
            duplicates += 1
            continue
        seen.add(key)

        offices.append(
            {
                "sido": sido,
                "sigungu": sigungu,
                "dong": dong,
                "kind": kind,
                "name": full_name,
                "zipcode": normalize_zipcode(row["우편번호"]),
                "address": row["주소"].strip(),
            }
        )

    offices.sort(key=lambda o: (o["sido"], o["sigungu"], o["dong"]))

    payload = {
        "_meta": {
            "source": "행정안전부 읍면동 하부행정기관 현황",
            "source_file": args.csv.name,
            "count": len(offices),
            "note": (
                "전화번호는 원본에 없다. 창구 안내는 '가서 무슨 말을 하면 되는지'로 내고, "
                "전화가 필요하면 정부민원안내콜센터 110으로 넘긴다."
            ),
            "usage": (
                "위치 기반 안내는 시군구까지만 안다. 시군구로 이 목록을 걸러 사용자가 "
                "자기 읍면동을 고르게 한다. 신분증 재발급은 관할이 없어 이 목록이 필요 없고, "
                "전입신고는 새 주소지 관할이라 필요하다."
            ),
        },
        "offices": offices,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    padded = sum(1 for row, o in zip(rows, offices, strict=False)
                 if len(row["우편번호"].strip()) == 4)
    by_sido = Counter(o["sido"] for o in offices)
    by_kind = Counter(o["kind"] or "(없음)" for o in offices)
    size = args.out.stat().st_size

    print(f"{len(offices)}건 → {args.out} ({size:,} bytes)")
    if duplicates:
        print(f"중복 {duplicates}건을 걸렀습니다.")
    if padded:
        print(f"우편번호 앞자리 0을 되살린 건: {padded}건 (원본이 4자리로 옴)")
    print("시도별:", dict(sorted(by_sido.items(), key=lambda x: -x[1])))
    print("기관 종류:", dict(by_kind))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
