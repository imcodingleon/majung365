"""rag_documents.jsonl 로더 — 근거 문서 색인 (Infrastructure).

수집기(tools/rag-crawler)의 산출물을 그대로 읽는다. 문서 하나가 섹션 여럿으로
나뉘어 있어 섹션을 검색 단위로 쓴다 — 문서 전체를 프롬프트에 넣으면 관련 없는
내용까지 따라 들어가고, 모델이 그 안에서 답을 찾느라 엉뚱한 대목을 인용한다.
"""

import json
from pathlib import Path

from app.domains.knowledge.domain.retrieval import Passage, PassageIndex

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "rag_documents.jsonl"

# 너무 짧은 섹션은 목차나 안내 문구라 근거가 되지 않는다.
_MIN_SECTION_CHARS = 80


class JsonRagRepository:
    def __init__(self, data_path: Path = _DATA_PATH) -> None:
        passages: list[Passage] = []
        for line in data_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            doc = json.loads(line)
            for section, text in (doc.get("sections") or {}).items():
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
        self._index = PassageIndex(passages)

    def index(self) -> PassageIndex:
        return self._index

    def count(self) -> int:
        return len(self._index)
