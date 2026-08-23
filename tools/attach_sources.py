"""RAG 수집 산출물에서 KB 제도의 출처와 확인 날짜를 채운다.

기획서 §6.4. AI 답변에 "이 안내가 어디서 왔고 언제 확인한 것인지"를 표시하려면
제도마다 출처 URL과 확인 날짜가 있어야 한다.

**route_ids로 자동 매칭하지 않는다.** 한 항목에 근거 문서가 여러 개라 route만 보면
전입신고 안내에 "정부24 홈" 같은 일반 페이지가 붙는다. 틀린 출처는 사용자를 엉뚱한
페이지로 보내므로, 여기서는 두 가지만 채운다.

1. KB의 source_url이 RAG 문서 URL과 **정확히 일치**하는 경우 (기계가 판단)
2. 아래 MANUAL 표에 사람이 확인해 적어 둔 경우

둘 다 아니면 비워 둔다. **확인하지 않은 날짜를 지어내지 않는다.**

사용법:
    python tools/attach_sources.py --rag <documents.jsonl> --kb <institutions.json>
    python tools/attach_sources.py --rag ... --kb ... --check   # 쓰지 않고 결과만 본다
"""

import argparse
import json
from pathlib import Path

# 사람이 확인해 짝지은 것. 문서 제목이 제도를 명확히 가리키는 경우만 적는다.
# 확신이 서지 않으면 비워 두는 쪽이 낫다 — 틀린 출처는 없는 출처보다 나쁘다.
MANUAL: dict[str, list[str]] = {
    "identity-address-registration": [
        "https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000016",
        "https://www.easylaw.go.kr/CSP/CnpClsMain.laf?csmSeq=666&ccfNo=4&cciNo=1&cnpClsNo=1",
    ],
    # 주민등록 "재등록"(말소된 등록을 되살림)이지 주민등록증 재발급이 아니다. 다른 절차다.
    "identity-resident-registration": [
        "https://www.gov.kr/mw/AA020InfoCappView.do?HighCtgCD=A01010&CappBizCD=13100000011",
        # 수감 중 말소된 경우 수감 사실 증명서류로 과태료가 면제된다는 안내.
        # 지자체(경상북도) 자료라 인용할 때 출처에 지자체명이 드러나야 한다.
        "https://gb.go.kr/Main/chi/page.do?mnu_uid=6664&dept_code=&dept_name=&BD_CODE=life_faq"
        "&bdName=&cmd=2&Start=60&B_NUM=58&B_STEP=2045299&B_LEVEL=0&key=4&word=&p1=0&p2=0"
        "&V_NUM=108&tbbscode1=life_faq",
    ],
    "identity-proof-of-release": [
        "https://www.corrections.go.kr/corrections/1075/subview.do",
        "https://www.kics.go.kr/",
    ],
    # 계좌 개설에서 실제로 부딪히는 것은 한도제한계좌다.
    "identity-bank-account": [
        "https://www.fsc.go.kr/no010101/82205",
        "https://www.shinhangroup.com/kr/archive/insight/extend/detail/32891",
        "https://www.fsc.go.kr/no010101/71982?curPage=435",
    ],
    # 정지 사유마다 근거가 다르다 — 압류는 법원, 한도제한은 금융위, 은행 자체 제한은 근거가 없다.
    # 문항 Q3-2-1이 세 갈래를 나눠 묻고 있으니 KB를 쪼갤 때 출처도 나눈다. 지금은 둘만 둔다.
    "identity-bank-account-unblock": [
        "https://ecfs.scourt.go.kr/psp/index.on?m=PSPA18M02",
        "https://www.fsc.go.kr/no010101/82205",
    ],
    "debt-legal-aid": [
        "https://www.helplaw24.go.kr/",
    ],
    "welfare-basic-livelihood": [
        "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do"
        "?wlfareInfoId=WLF00001132&wlfareInfoReldBztpCd=01",
    ],
    "welfare-emergency-support": [
        "https://www.mohw.go.kr/menu.es?mid=a10708010100",
        "https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000280438&chrClsCd=010201",
    ],
    "employment-national-support": [
        "https://www.work24.go.kr/ua/z/z/1300/selectEmssRqutIntro.do",
        "https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=14920000086",
    ],
    "health-medical-aid": [
        "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do"
        "?wlfareInfoId=WLF00000102&wlfareInfoReldBztpCd=01",
        "https://www.mohw.go.kr/menu.es?mid=a10708030100",
        "https://www.nhis.or.kr/nhis/minwon/minwonServiceBoard.do?mode=view&articleNo=10945783",
    ],
    "health-mental-support": [
        "https://www.mohw.go.kr/menu.es?mid=a10706040100",
        "https://www.mohw.go.kr/menu.es?mid=a10706040300",
    ],
    "debt-credit-recovery": [
        "https://www.ccrs.or.kr/cms/com/index.do?MENU_ID=490",
    ],
    # 06_03_2.do는 "기관 찾기"(지부 목록)라 숙식 제도 안내가 아니다.
    "housing-koreha-residence": [
        "https://koreha.or.kr/sub/02_01.do?MN=207&MN1=3&MN2=16&MN3=207",
    ],
    # 이 KB 항목은 이름·요약이 정부 긴급복지를 가리키므로 그 문서를 붙인다.
    # 다만 route_ids가 R4(공단 주거지원)라 항목의 정체가 어긋나 있다 — §12에 올렸다.
    "housing-emergency-welfare-housing": [
        "https://www.mohw.go.kr/menu.es?mid=a10708010100",
    ],
    # 취업지원(02_01_4)이 먼저다. 직업훈련(02_01_3)도 이 제도의 일부라 함께 둔다.
    "employment-koreha-job": [
        "https://www.koreha.or.kr/sub/02_01_4.do",
        "https://www.koreha.or.kr/sub/02_01_3.do",
    ],
}


def normalize(url: str) -> str:
    """스킴과 www, 끝 슬래시 차이는 같은 문서로 본다."""
    u = url.strip()
    for prefix in ("https://", "http://"):
        if u.startswith(prefix):
            u = u[len(prefix) :]
    if u.startswith("www."):
        u = u[4:]
    return u.rstrip("/")


def main() -> int:
    parser = argparse.ArgumentParser(description="RAG 출처·확인 날짜를 KB에 채운다")
    parser.add_argument("--rag", type=Path, required=True)
    parser.add_argument("--kb", type=Path, required=True)
    parser.add_argument("--check", action="store_true", help="쓰지 않고 결과만 본다")
    args = parser.parse_args()

    docs = [json.loads(line) for line in args.rag.read_text(encoding="utf-8").splitlines() if line]
    by_url = {normalize(d["source_url"]): d for d in docs}

    data = json.loads(args.kb.read_text(encoding="utf-8"))
    filled = unmatched = 0

    for inst in data["institutions"]:
        urls: list[str] = []
        # ① KB가 이미 가리키는 페이지가 수집 목록에 있으면 그것부터
        if normalize(inst.get("source_url", "")) in by_url:
            urls.append(inst["source_url"])
        # ② 사람이 확인해 짝지은 것
        for url in MANUAL.get(inst["id"], []):
            if normalize(url) not in {normalize(u) for u in urls}:
                urls.append(url)

        matched = [by_url[normalize(u)] for u in urls if normalize(u) in by_url]
        missing = [u for u in urls if normalize(u) not in by_url]
        if missing:
            print(f"  ! {inst['id']}: 수집 목록에 없는 URL {missing}")

        if matched:
            # 확인 날짜는 그 제도의 근거 중 **가장 오래된 것**을 쓴다.
            # 가장 최근을 쓰면 오래된 근거까지 최근에 확인한 것처럼 보인다.
            inst["source_urls"] = [m["source_url"] for m in matched]
            inst["verified_at"] = min(m["fetched_at"][:10] for m in matched)
            filled += 1
            print(f"  + {inst['id']:<34} {inst['verified_at']}  출처 {len(matched)}건")
        else:
            inst.pop("source_urls", None)
            inst.pop("verified_at", None)
            unmatched += 1
            print(f"  - {inst['id']:<34} (출처 미확인 — 화면에 날짜를 표시하지 않는다)")

    data["_meta"]["verified_at"] = (
        "마중365가 그 자료를 확인한 날짜다. 기관이 문서를 갱신한 날이 아니다 — "
        "화면 문구가 이 구분을 흐리면 안 된다."
    )
    print(f"\n채운 제도 {filled}건 · 미확인 {unmatched}건")

    if args.check:
        print("(--check 이므로 파일을 쓰지 않았다)")
        return 0
    args.kb.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
