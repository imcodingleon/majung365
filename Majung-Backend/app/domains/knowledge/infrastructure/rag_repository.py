"""rag_documents.jsonl 로더 — 근거 문서 색인 (Infrastructure).

수집기(tools/rag-crawler)의 산출물을 그대로 읽는다. 문서 하나가 섹션 여럿으로
나뉘어 있어 섹션을 검색 단위로 쓴다 — 문서 전체를 프롬프트에 넣으면 관련 없는
내용까지 따라 들어가고, 모델이 그 안에서 답을 찾느라 엉뚱한 대목을 인용한다.
"""

import json
import logging
from pathlib import Path

from app.domains.knowledge.domain.retrieval import Passage, PassageIndex

logger = logging.getLogger("majung.knowledge")

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "rag_documents.jsonl"

# 너무 짧은 섹션은 목차나 안내 문구라 근거가 되지 않는다.
_MIN_SECTION_CHARS = 80

# 수집이 막힌 문서를 색인에서 뺀다.
#
# **정부24가 자동 수집을 거부하면 그 거부 안내문이 본문 자리에 들어온다.** 실제로
# "서비스 접속이 차단되었습니다"가 R9·R11·R15의 근거로 저장되어 있었다. 짧은 것은
# 길이 조건에 걸리지만 89자짜리는 통과해서, 사용자 화면에 그 문구가 근거로 표시될
# 수 있었다.
#
# 수집기는 우회하지 않고 warnings에 정직하게 남긴다. 그 표시를 여기서 받는다 —
# 데이터를 한 번 고치는 것으로는 다음 수집에서 또 생기는 문제를 막지 못한다.
_BLOCKED_WARNING = "자동 수집을 차단"

# 본문 첫머리가 차단 안내인 경우. warnings가 비어 있어도 걸러내는 이중 방어다.
# **첫머리만 본다** — 본문 중간의 "계좌가 차단되었습니다" 같은 정상 내용을
# 지우면 안 되기 때문이다.
_BLOCKED_HEAD = ("서비스 접속이 차단", "비정상 서비스 접속", "접속이 불가능")
_HEAD_CHARS = 60


def _is_blocked(doc: dict[str, object], sections: dict[str, str]) -> bool:
    warnings = doc.get("warnings")
    if isinstance(warnings, list) and any(
        _BLOCKED_WARNING in str(w) for w in warnings
    ):
        return True
    return any(
        any(mark in text[:_HEAD_CHARS] for mark in _BLOCKED_HEAD)
        for text in sections.values()
        if isinstance(text, str)
    )


class JsonRagRepository:
    def __init__(self, data_path: Path = _DATA_PATH) -> None:
        passages: list[Passage] = []
        blocked: list[str] = []
        for line in data_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            doc = json.loads(line)
            sections = doc.get("sections") or {}
            if _is_blocked(doc, sections):
                blocked.append(str(doc.get("id", "?")))
                continue
            for section, text in sections.items():
                if not isinstance(text, str) or len(text) < _MIN_SECTION_CHARS:
                    continue
                passages.append(
                    Passage(
                        doc_id=doc["id"],
                        title=doc.get("title", ""),
                        section=section,
                        text=text,
                        source_url=doc["source_url"],
                        fetched_at=doc.get("fetched_at", "")[:10],
                        route_ids=tuple(doc.get("route_ids", [])),
                        department=doc.get("department", ""),
                    )
                )
        if blocked:
            # **조용히 사라지지 않게 한다.** 근거가 빠진 채로 답하는 것보다
            # 무엇이 빠졌는지 아는 편이 낫다 — 재수집 대상 목록이기도 하다.
            logger.warning(
                "📄 수집이 막힌 문서 %d건을 색인에서 제외했다 (재수집 필요): %s",
                len(blocked),
                ", ".join(blocked),
            )
        self._index = PassageIndex(passages)

    def index(self) -> PassageIndex:
        return self._index

    def count(self) -> int:
        return len(self._index)
