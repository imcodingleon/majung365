"""Anthropic 구현 — ChatLlm 포트 + StateExtractorLlm 포트(C6). anthropic import는 이 파일에서만.

- triage: 구조화 출력(json_schema)으로 지원 항목(R1~R15) 분류. 빠르게(thinking 끔).
- stream_guidance: 스트리밍으로 쉬운 말 안내. daily 질문이면 공공 도메인 웹 검색 허용.
- extract_narrative_states: 온보딩 마지막 자유서술 1건 → 언급된 그래프 노드들의
  상태(O/X/BLOCKED) 일괄 판정. knowledge 도메인이 쓰지만, "Claude 호출은
  claude_client.py에서만" 규칙 때문에 여기 둔다.
보안: 사용자 입력 원문을 로그에 남기지 않는다. API 키는 settings 경유.
"""

import json
import logging
from collections.abc import AsyncIterator, Callable
from typing import Any

from anthropic import AsyncAnthropic

from app.domains.chat.application.dto import Turn
from app.domains.chat.domain.prompts import (
    TRIAGE_INSTRUCTION,
    build_system_prompt,
)
from app.domains.chat.domain.triage import (
    QuestionType,
    RoutePriority,
    TriageResult,
)
from app.domains.knowledge.domain.graph_engine import NodeState
from app.domains.shared.routes import RouteId
from app.infrastructure.config.settings import Settings
from app.infrastructure.tls import make_async_http_client

logger = logging.getLogger("majung.claude")

_NARRATIVE_EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "mentions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "node_id": {"type": "string"},
                    "state": {"type": "string", "enum": ["O", "X", "BLOCKED"]},
                },
                "required": ["node_id", "state"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["mentions"],
    "additionalProperties": False,
}

_NARRATIVE_EXTRACT_SYSTEM_TEMPLATE = """당신은 마중365의 상태 판정기입니다. 사용자가 자유롭게 쓴 글을 읽고, 아래 목록 중 실제로 언급됐거나 명확히 유추할 수 있는 항목만 상태를 판정하세요.

목록(id: 이름):
{node_list}

상태:
- O: 있고 정상적으로 쓸 수 있다
- X: 없다
- BLOCKED: 있기는 한데 정지·분실·만료 등으로 지금 못 쓴다

글에서 언급되지 않은 항목은 절대 포함하지 마세요. 애매하면 포함하지 마세요. 훈계·되묻기 없이 판정만 하세요."""  # noqa: E501

_TRIAGE_SCHEMA = {
    "type": "object",
    "properties": {
        "question_type": {"type": "string", "enum": ["support", "daily"]},
        "priorities": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "route": {
                        "type": "string",
                        "enum": [r.value for r in RouteId],
                    },
                    "reason": {"type": "string"},
                },
                "required": ["route", "reason"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["question_type", "priorities"],
    "additionalProperties": False,
}


def _to_messages(history: list[Turn], message: str) -> list[dict[str, str]]:
    msgs = [
        {"role": t.role, "content": t.content}
        for t in history
        if t.role in ("user", "assistant")
    ]
    # 첫 메시지는 user여야 한다 — 앞쪽 assistant 턴 제거
    while msgs and msgs[0]["role"] == "assistant":
        msgs.pop(0)
    msgs.append({"role": "user", "content": message})
    return msgs


class ClaudeChatLlm:
    def __init__(
        self,
        settings: Settings,
        record_call: Callable[[], None] | None = None,
    ) -> None:
        self._settings = settings
        # Windows OpenSSL applink 크래시 우회를 위해 안전한 http 클라이언트 주입
        self._client = AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            http_client=make_async_http_client(),
        )
        self._model = settings.claude_model
        # 실제 Claude 호출마다 지출 카운트 증가(콜 단위). 없으면 무시.
        self._record_call = record_call or (lambda: None)

    async def triage(self, message: str, history: list[Turn]) -> TriageResult:
        self._record_call()
        # 외부 SDK(TypedDict) 경계 — dict 리터럴은 런타임엔 유효하나 strict 타입 매칭만 예외
        create_kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": 1024,
            "thinking": {"type": "disabled"},
            "output_config": {
                "effort": "low",
                "format": {"type": "json_schema", "schema": _TRIAGE_SCHEMA},
            },
            "system": TRIAGE_INSTRUCTION,
            "messages": _to_messages(history, message),
        }
        resp = await self._client.messages.create(**create_kwargs)
        text = next((b.text for b in resp.content if getattr(b, "type", None) == "text"), "")
        return self._parse_triage(text)

    def _parse_triage(self, text: str) -> TriageResult:
        try:
            data = json.loads(text)
            qtype = QuestionType(data["question_type"])
            priorities = tuple(
                RoutePriority(route=RouteId(p["route"]), reason=str(p.get("reason", "")))
                for p in data.get("priorities", [])
            )
            return TriageResult(question_type=qtype, priorities=priorities)
        except Exception:
            # triage 파싱 실패 시 일반 대화로 폴백 — 챗은 계속 답한다
            logger.warning("triage 파싱 실패 — daily 폴백")
            return TriageResult(question_type=QuestionType.DAILY, priorities=())

    async def stream_guidance(
        self,
        *,
        message: str,
        history: list[Turn],
        context: str,
        allow_web_search: bool,
    ) -> AsyncIterator[str]:
        self._record_call()
        system = build_system_prompt() + "\n\n" + context
        tools = None
        if allow_web_search:
            tools = [
                {
                    "type": "web_search_20260209",
                    "name": "web_search",
                    "allowed_domains": self._settings.web_search_domains_list,
                    "max_uses": self._settings.web_search_max_uses,
                }
            ]
        # 외부 SDK(TypedDict) 경계 — dict 조립은 런타임엔 유효, strict 타입 매칭만 예외
        kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": 2048,
            "system": system,
            "messages": _to_messages(history, message),
        }
        if tools is not None:
            kwargs["tools"] = tools

        async with self._client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text

    async def extract_narrative_states(
        self, nodes: dict[str, str], narrative: str
    ) -> dict[str, NodeState]:
        self._record_call()
        node_list = "\n".join(f"- {nid}: {name}" for nid, name in nodes.items())
        create_kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": 512,
            "thinking": {"type": "disabled"},
            "output_config": {
                "effort": "low",
                "format": {"type": "json_schema", "schema": _NARRATIVE_EXTRACT_SCHEMA},
            },
            "system": _NARRATIVE_EXTRACT_SYSTEM_TEMPLATE.format(node_list=node_list),
            "messages": [{"role": "user", "content": narrative}],
        }
        resp = await self._client.messages.create(**create_kwargs)
        text = next((b.text for b in resp.content if getattr(b, "type", None) == "text"), "")
        return self._parse_narrative(text, valid_ids=set(nodes))

    def _parse_narrative(self, text: str, valid_ids: set[str]) -> dict[str, NodeState]:
        try:
            data = json.loads(text)
            result: dict[str, NodeState] = {}
            for m in data.get("mentions", []):
                node_id = m.get("node_id")
                if node_id not in valid_ids:
                    continue
                try:
                    result[node_id] = NodeState(m["state"])
                except ValueError:
                    continue
            return result
        except Exception:
            # 서술 판정 실패 시 빈 결과 — 그래프 엔진은 버튼 답변만으로 계속 진행(SSOT §9 폴백①)
            logger.warning("서술 상태 판정 파싱 실패 — 버튼 답변만 사용")
            return {}
