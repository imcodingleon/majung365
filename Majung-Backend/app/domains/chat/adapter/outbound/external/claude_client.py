"""Anthropic 구현 — ChatLlm 포트. anthropic import는 이 파일에서만.

- triage: 구조화 출력(json_schema)으로 6영역 분류. 빠르게(thinking 끔).
- stream_guidance: 스트리밍으로 쉬운 말 안내. daily 질문이면 공공 도메인 웹 검색 허용.
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
    AreaPriority,
    QuestionType,
    TriageResult,
)
from app.domains.shared.areas import Area
from app.infrastructure.config.settings import Settings
from app.infrastructure.tls import make_async_http_client

logger = logging.getLogger("majung.claude")

_TRIAGE_SCHEMA = {
    "type": "object",
    "properties": {
        "question_type": {"type": "string", "enum": ["support", "daily"]},
        "priorities": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "area": {
                        "type": "string",
                        "enum": [a.value for a in Area],
                    },
                    "reason": {"type": "string"},
                },
                "required": ["area", "reason"],
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
                AreaPriority(area=Area(p["area"]), reason=str(p.get("reason", "")))
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
