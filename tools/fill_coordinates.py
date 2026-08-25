"""기관 데이터에 위도·경도를 채운다.

지도에 마커를 찍으려면 좌표가 있어야 하는데, 지금 좌표를 가진 것은 `centers.json`
여덟 건뿐이다. 나머지 세 파일 3,839건은 주소만 있다. 주소는 이미 있으므로 **한 번
변환해 파일에 넣어 두면 끝난다** — 화면을 그릴 때마다 변환하면 매번 요금이 나가고
느려진다.

**기관 주소는 개인정보가 아니다.** 변환에 외부 API를 써도 사용자 위치가 나가지
않는다. 기획서 §5.4가 금지한 것은 "사용자 좌표의 역지오코딩"이며 이것과 다른 일이다.

지켜야 할 것 셋:

- **이미 좌표가 있는 항목은 건너뛴다.** 다시 돌려도 요금이 두 번 나가지 않는다
- **변환에 실패한 항목은 좌표 없이 남기고 목록으로 보고한다.** 실패를 조용히 넘기면
  어느 기관이 지도에서 빠졌는지 아무도 모른다
- **키는 인자나 환경변수로 받는다.** 스크립트에 적지 않는다

사용법:
    python tools/fill_coordinates.py --key <구글 키>
    GOOGLE_MAPS_KEY=... python tools/fill_coordinates.py --only district_offices
    python tools/fill_coordinates.py --key <키> --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

DATA_DIR = Path("Majung-Backend/app/domains/centers/data")

# 파일마다 목록이 담긴 키가 다르다. `_meta`는 건드리지 않는다.
TARGETS: dict[str, str] = {
    "district_offices.json": "offices",
    "koreha_branches.json": "items",
    "mental_health_centers.json": "items",
}

GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
# 구글 기본 상한은 초당 50건이다. 여유를 두고 던진다.
SLEEP_SECONDS = 0.05


def geocode(address: str, key: str) -> tuple[float, float] | None:
    """주소 하나를 좌표로. 못 찾으면 None."""
    query = urllib.parse.urlencode(
        {"address": address, "key": key, "region": "kr", "language": "ko"}
    )
    try:
        with urllib.request.urlopen(f"{GEOCODE_URL}?{query}", timeout=20) as res:
            body = json.loads(res.read().decode("utf-8"))
    except Exception as err:  # noqa: BLE001 — 어떤 실패든 그 항목만 건너뛴다
        print(f"    요청 실패: {err}", file=sys.stderr)
        return None

    status = body.get("status")
    if status == "OVER_QUERY_LIMIT":
        # 이건 건너뛸 일이 아니다. 남은 것을 전부 헛되이 던지게 된다.
        raise SystemExit("구글이 한도 초과를 알렸다. 잠시 뒤 다시 돌려라.")
    if status != "OK" or not body.get("results"):
        return None

    loc = body["results"][0]["geometry"]["location"]
    return float(loc["lat"]), float(loc["lng"])


def address_of(row: dict[str, Any]) -> str:
    """검색에 쓸 주소. 이름을 함께 넣으면 오히려 엉뚱한 곳이 잡힌다."""
    return str(row.get("address") or "").strip()


def fill(path: Path, list_key: str, key: str, *, dry_run: bool) -> tuple[int, list[str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data[list_key]

    todo = [r for r in rows if "lat" not in r or r.get("lat") is None]
    print(f"  전체 {len(rows)}건 · 채울 것 {len(todo)}건")
    if dry_run or not todo:
        return 0, []

    filled = 0
    failed: list[str] = []
    for i, row in enumerate(todo, 1):
        address = address_of(row)
        if not address:
            failed.append(f"{row.get('name', '이름 없음')} (주소 없음)")
            continue

        found = geocode(address, key)
        if found is None:
            failed.append(f"{row.get('name', '이름 없음')}: {address}")
        else:
            row["lat"], row["lng"] = found
            filled += 1

        if i % 100 == 0:
            print(f"    {i}/{len(todo)} …")
        time.sleep(SLEEP_SECONDS)

    # **한 번에 쓴다.** 도중에 죽어도 원본이 반쪽으로 남지 않는다.
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return filled, failed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--key", default=os.environ.get("GOOGLE_MAPS_KEY", ""))
    parser.add_argument("--only", help="파일 이름 일부. 하나만 돌릴 때 쓴다")
    parser.add_argument(
        "--dry-run", action="store_true", help="몇 건을 채울지만 세고 요청은 보내지 않는다"
    )
    args = parser.parse_args()

    if not args.key and not args.dry_run:
        raise SystemExit("키가 없다. --key 로 주거나 GOOGLE_MAPS_KEY 를 설정해라.")

    total_filled = 0
    all_failed: list[str] = []
    for filename, list_key in TARGETS.items():
        if args.only and args.only not in filename:
            continue
        path = DATA_DIR / filename
        print(f"\n{filename}")
        filled, failed = fill(path, list_key, args.key, dry_run=args.dry_run)
        total_filled += filled
        all_failed.extend(failed)

    print(f"\n채운 것 {total_filled}건")
    if all_failed:
        # **조용히 넘기지 않는다.** 어느 기관이 지도에서 빠지는지 눈에 보여야 한다.
        print(f"못 찾은 것 {len(all_failed)}건:")
        for line in all_failed[:30]:
            print(f"  - {line}")
        if len(all_failed) > 30:
            print(f"  … 그 밖에 {len(all_failed) - 30}건")


if __name__ == "__main__":
    main()
