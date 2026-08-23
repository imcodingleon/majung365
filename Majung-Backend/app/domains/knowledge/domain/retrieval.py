"""근거 문서 검색 — 순수 Python (Domain).

기획서 §6.4 ①단계. 수집한 근거 문서에서 관련 내용을 찾아 답의 바탕으로 쓴다.
찾지 못하면 ②단계(웹 검색)로 넘어간다.

**외부 임베딩 API를 쓰지 않는다.** 문서가 79건이라 매 요청마다 전부 점수를 매겨도
빠르고, 임베딩을 붙이면 사용자 질문이 또 다른 외부 서비스로 나간다. 이 서비스에서
질문 자체가 민감정보라(출소 사실이 드러난다) 나가는 곳을 하나라도 줄이는 편이 낫다.

한국어라 토큰화가 관건이다. 조사가 붙어 어절이 정확히 일치하지 않으므로
("긴급복지지원" vs "긴급복지를") **어절과 음절 2-gram을 함께 쓴다.** 형태소 분석기는
의존성이 커서 쓰지 않는다 — 79건 규모에서는 2-gram으로 충분하다.
"""

import math
import re
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field

# 한글·영숫자 덩어리만 본다. 조사는 떼지 않고 2-gram이 흡수하게 둔다.
_TOKEN = re.compile(r"[가-힣]+|[a-zA-Z]+|\d+")

# 너무 흔해서 변별력이 없는 말. 검색어에서 빼지 않으면 모든 문서가 걸린다.
_STOPWORDS = frozenset(
    {
        "그리고", "하지만", "그런데", "저는", "제가", "어떻게", "무엇", "뭐",
        "있나요", "없나요", "합니다", "해요", "하나요", "인가요", "입니다",
        "관련", "경우", "위해", "대한", "때문", "그것", "이것", "저것",
    }
)

# 어미·조사에서 나오는 2-gram. 내용어가 아닌데 문서에 흔해서 점수를 만든다.
# "오늘 점심 뭐 먹을까요"가 근거 문서에 11점으로 걸린 원인이 "을까"·"까요"였다.
_GRAM_STOPWORDS = frozenset(
    {
        "까요", "을까", "나요", "어요", "아요", "해요", "세요", "예요", "에요",
        "는데", "은데", "니다", "습니", "니까", "으로", "에서", "에게", "한테",
        "부터", "까지", "하고", "이고", "이나", "거나", "지만", "면서", "려면",
        "어야", "아야", "해야", "하는", "되는", "있는", "없는", "같은", "만큼",
    }
)

# BM25 계수. 문서 길이 차이가 큰 편이라(300자~1만자) 정규화를 세게 건다.
_K1 = 1.2
_B = 0.75

# 이 점수 아래면 "찾지 못했다"로 본다. 억지로 붙인 근거는 없느니만 못하다 —
# 관련 없는 문서를 근거로 답하면 사용자가 그것을 제도 안내로 믿는다.
# "오늘 점심 뭐 먹지" 같은 무관한 질문이 4점대로 걸려서 그 위로 올렸다.
MIN_SCORE = 8.0

# 1위 대비 이 비율 미만이면 버린다. 절대 점수만 보면 질문이 길 때 관련 없는 구절까지
# 점수가 올라간다. 상위와 확연히 차이 나는 것은 그 질문의 근거가 아니다.
_RELATIVE_CUTOFF = 0.55


# 카드 요약이 이보다 짧으면 검색에 보탬이 되지 않는다.
_MIN_CARD_CHARS = 20


@dataclass(frozen=True)
class CardText:
    """검색에 얹을 카드 한 장. 도메인이 KB 저장소를 알지 않도록 값만 받는다."""

    id: str
    name: str
    summary: str
    next_step: str
    source_url: str
    verified_at: str
    route_ids: tuple[str, ...]
    # 항목 이름과 탭 이름. 짧은 질문이 여기 걸린다.
    labels: str = ""


@dataclass(frozen=True)
class Passage:
    """검색 단위. 문서 하나가 섹션 여럿으로 나뉜다."""

    doc_id: str
    title: str
    section: str
    text: str
    source_url: str
    fetched_at: str
    route_ids: tuple[str, ...]
    # 지자체 자료는 인용할 때 지자체명이 드러나야 한다 — 제도 조건이 지역마다 다르고,
    # 사용자는 그것이 자기 지역 기준이 아니라는 것을 알 방법이 없다(§6.4).
    department: str = ""
    # 카드에서 만든 구절인가. **그 항목을 찾을 때만 후보가 된다.**
    #
    # 카드 요약은 50~150자로 짧아서 BM25의 길이 정규화가 높은 점수를 준다. 그냥
    # 섞으면 관련 없는 카드가 1순위로 튀어 오른다 — "월세 보증금"에 채무 카드가
    # 걸린 적이 있다. 이 구절의 목적은 그 항목 문서가 안 잡히는 것을 메우는
    # 것이지 다른 항목 검색에 끼어드는 것이 아니다.
    is_card: bool = False


@dataclass
class _Indexed:
    passage: Passage
    counts: Counter[str] = field(default_factory=Counter)
    length: int = 0


def tokenize(text: str) -> list[str]:
    """어절과 음절 2-gram을 함께 낸다.

    "긴급복지 신청"을 검색하면 "긴급복지지원제도" 문서가 걸려야 하는데 어절만으로는
    일치하지 않는다. 2-gram이 그 사이를 메운다.
    """
    tokens: list[str] = []
    for word in _TOKEN.findall(text.lower()):
        if word in _STOPWORDS or len(word) < 2:
            continue
        tokens.append(word)
        if len(word) > 2 and word[0] >= "가":
            tokens.extend(
                gram
                for gram in (word[i : i + 2] for i in range(len(word) - 1))
                if gram not in _GRAM_STOPWORDS
            )
    return tokens


class PassageIndex:
    """BM25 색인. 부팅 때 한 번 만들고 이후에는 읽기만 한다."""

    def __init__(self, passages: list[Passage]) -> None:
        self._docs = [_Indexed(passage=p) for p in passages]
        self._df: Counter[str] = Counter()
        for doc in self._docs:
            tokens = tokenize(f"{doc.passage.title} {doc.passage.text}")
            doc.counts = Counter(tokens)
            doc.length = len(tokens)
            self._df.update(doc.counts.keys())
        self._avg_len = (
            sum(d.length for d in self._docs) / len(self._docs) if self._docs else 0.0
        )

    def __len__(self) -> int:
        return len(self._docs)

    def _idf(self, term: str) -> float:
        n = len(self._docs)
        df = self._df.get(term, 0)
        return math.log(1 + (n - df + 0.5) / (df + 0.5))

    def search(
        self,
        query: str,
        routes: frozenset[str] = frozenset(),
        limit: int = 3,
    ) -> list[tuple[Passage, float]]:
        """질문과 관련된 구절을 점수 높은 순으로. 점수가 낮으면 아무것도 돌려주지 않는다.

        routes를 주면 그 지원 항목의 문서에 가산점을 준다. 걸러내지는 않는다 —
        triage가 항목을 잘못 골랐을 때 답이 있는 문서까지 사라지면 안 된다.
        """
        terms = tokenize(query)
        if not terms or not self._docs:
            return []

        scored: list[tuple[Passage, float]] = []
        for doc in self._docs:
            if doc.passage.is_card and not (
                routes and set(doc.passage.route_ids) & routes
            ):
                # 카드 구절은 그 항목을 찾을 때만 후보다.
                continue
            score = 0.0
            for term in set(terms):
                tf = doc.counts.get(term, 0)
                if not tf:
                    continue
                norm = tf * (_K1 + 1) / (
                    tf + _K1 * (1 - _B + _B * doc.length / (self._avg_len or 1))
                )
                score += self._idf(term) * norm
            if routes and set(doc.passage.route_ids) & routes:
                score *= 1.3  # 항목이 맞으면 가산. 배제가 아니라 가중이다
            if score >= MIN_SCORE:
                scored.append((doc.passage, score))

        if not scored:
            return []
        scored.sort(key=lambda x: (-x[1], x[0].doc_id))
        floor = scored[0][1] * _RELATIVE_CUTOFF
        return [hit for hit in scored[:limit] if hit[1] >= floor]


def card_passages(
    cards: "Iterable[CardText]",
) -> list[Passage]:
    """카드의 쉬운 말을 검색 대상으로 만든다.

    **사람이 검수한 문장이 이미 있는데 검색에 쓰이지 않고 있었다.** 수집한 공식
    문서는 행정 용어로 쓰여 있어서 "나갈 데가 없는데 오늘 밤 어디서 자요" 같은
    말과 이어지지 않는다. 반면 카드의 요약은 그 말투로 쓰여 있다.

        R2  "급하게 돈이 필요할 때 ... 밥값·병원비·월세"
        R7  "장사나 사업을 시작할 때 가게 보증금을 낮은 이자로 빌려줘요"

    항목 이름(탭 이름 포함)도 함께 넣는다. 짧은 질문은 그쪽에 걸린다.

    새 데이터를 만들지 않는다. 있는 것을 검색이 볼 수 있게 할 뿐이다.
    """
    made: list[Passage] = []
    for card in cards:
        body = " ".join(
            part for part in (card.labels, card.name, card.summary, card.next_step) if part
        ).strip()
        if len(body) < _MIN_CARD_CHARS:
            continue
        made.append(
            Passage(
                doc_id=card.id,
                title=card.name,
                section="쉬운 안내",
                text=body,
                source_url=card.source_url,
                fetched_at=card.verified_at,
                route_ids=card.route_ids,
                department=card.name,
                is_card=True,
            )
        )
    return made
