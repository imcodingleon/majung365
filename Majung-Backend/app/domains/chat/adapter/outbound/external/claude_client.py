"""Anthropic 구현 — ChatLlm 포트 + StateExtractorLlm 포트(C6). anthropic import는 이 파일에서만.

- triage: 구조화 출력(json_schema)으로 지원 항목(R1~R15) 분류. 빠르게(thinking 끔).
  **왜 급한지는 모델에게 묻지 않는다** — 자유 문구에 사용자가 말한 죄목이 실린다.
- stream_guidance: 스트리밍으로 쉬운 말 안내. daily 질문이면 공공 도메인 웹 검색 허용.
- extract_narrative_states: 온보딩 마지막 자유서술 1건 → 언급된 그래프 노드들의
  상태(O/X/BLOCKED) 일괄 판정. knowledge 도메인이 쓰지만, "Claude 호출은
  claude_client.py에서만" 규칙 때문에 여기 둔다.
- summarize_visit: 담당자가 먼저 읽는 요약(§7.4). 같은 이유로 여기 둔다 —
  프롬프트는 visit 도메인에 있고 호출만 이 파일이 맡는다.
보안: 사용자 입력 원문을 로그에 남기지 않는다. API 키는 settings 경유.
**사용자가 쓴 텍스트는 전부 마스킹을 거쳐 나간다**(infrastructure/security/masking.py).
이 파일이 Claude로 나가는 유일한 출구이므로, 여기서 새면 다른 방어가 의미 없다.
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Callable
from typing import Any

from anthropic import AsyncAnthropic

from app.domains.chat.application.dto import Turn
from app.domains.chat.application.port import GuidanceChunk
from app.domains.chat.domain.prompts import (
    build_system_prompt,
    build_triage_instruction,
)
from app.domains.chat.domain.suggestions import (
    SUGGESTIONS_INSTRUCTION,
    SUGGESTIONS_SCHEMA,
)
from app.domains.chat.domain.triage import (
    QuestionType,
    RoutePriority,
    TriageResult,
    UserRegion,
)
from app.domains.knowledge.domain.graph_engine import NodeState
from app.domains.shared.routes import RouteId
from app.domains.visit.domain.summary import (
    SUMMARY_INSTRUCTION,
    SUMMARY_SCHEMA,
    normalize_summary,
)
from app.infrastructure.config.settings import Settings
from app.infrastructure.security.masking import assert_masked, mask_text
from app.infrastructure.tls import make_async_http_client

logger = logging.getLogger("majung.claude")

# 요약 한 건에 걸어 두는 상한. 담당자는 몇 초 뒤에 다시 열어 보는 구조라
# 오래 기다릴 이유가 없고, **늘어지면 상태가 pending에 머문 채 남는다.**
# 채팅 스트리밍에는 걸지 않는다 — 긴 안내는 원래 오래 흐른다.
_SUMMARY_TIMEOUT_SECONDS = 45

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
                    # 사용자가 말한 상태. 초기 진단이 문항으로 아는 것을 여기서는
                    # 문장으로 안다. 안 오면 서버가 X로 둔다.
                    "state": {
                        "type": "string",
                        "enum": ["O", "X", "BLOCKED"],
                    },
                },
                "required": ["route"],
                "additionalProperties": False,
            },
        },
        "region": {
            "type": "object",
            "description": "사용자가 자기 입으로 말한 지역. 말한 것만 채운다.",
            "properties": {
                "sido": {"type": "string"},
                "sigungu": {"type": "string"},
                "dong": {"type": "string"},
            },
            "required": ["sido", "sigungu", "dong"],
            "additionalProperties": False,
        },
    },
    "required": ["question_type", "priorities"],
    "additionalProperties": False,
}


def _to_messages(
    history: list[Turn], message: str, *, name: str | None = None
) -> list[dict[str, str]]:
    """대화를 SDK 형식으로 바꾸면서 마스킹한다.

    마스킹을 이 함수 안에서 하는 이유는 외부 호출이 전부 여기를 지나기 때문이다.
    호출부에서 따로 부르게 하면 새 메서드를 추가하는 사람이 잊는다.
    assistant 턴도 마스킹한다 — 이전 답변이 사용자 이름을 되받아 적었을 수 있다.
    """
    msgs = [
        {"role": t.role, "content": mask_text(t.content, name=name)}
        for t in history
        if t.role in ("user", "assistant")
    ]
    # 첫 메시지는 user여야 한다 — 앞쪽 assistant 턴 제거
    while msgs and msgs[0]["role"] == "assistant":
        msgs.pop(0)
    msgs.append({"role": "user", "content": mask_text(message, name=name)})
    for m in msgs:
        assert_masked(m["content"])  # 전송 직전 안전망 — 새 경로가 마스킹을 건너뛰면 여기서 막힌다
    return msgs


def _region_of(raw: object) -> UserRegion:
    """모델이 낸 지역. **짐작해서 채우지 않는다** — 없으면 빈 값이다."""
    if not isinstance(raw, dict):
        return UserRegion()
    return UserRegion(
        sido=str(raw.get("sido", "") or "").strip(),
        sigungu=str(raw.get("sigungu", "") or "").strip(),
        dong=str(raw.get("dong", "") or "").strip(),
    )


def _state_of(raw: object) -> NodeState:
    """모델이 낸 상태 문자열을 값으로. **모르면 X다** — 말하지 않은 것을 짐작하지 않는다."""
    try:
        return NodeState(str(raw))
    except ValueError:
        return NodeState.X


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

    async def triage(
        self,
        message: str,
        history: list[Turn],
        *,
        name: str | None = None,
        route_label: str = "",
    ) -> TriageResult:
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
            "system": build_triage_instruction(route_label),
            "messages": _to_messages(history, message, name=name),
        }
        resp = await self._client.messages.create(**create_kwargs)
        text = next((b.text for b in resp.content if getattr(b, "type", None) == "text"), "")
        return self._parse_triage(text)

    async def suggest_questions(
        self, history: list[Turn], *, context: str = "", name: str | None = None
    ) -> tuple[str, ...]:
        """이어서 물어볼 만한 질문 (§6.1).

        **`_to_messages`를 지나므로 대화 전체가 마스킹된다.** 방금 한 답변까지
        포함해 다시 모델로 나가는 경로라, 이 함수가 마스킹을 건너뛰면 §9.3이
        답변 생성 경로에서만 지켜지는 셈이 된다.

        **지시문에 전화번호를 예시로 쓰지 않는다.** `assert_masked`가 마지막
        user 메시지(지시문)에도 걸려, 15xx·16xx 형태가 섞이면 그 자리에서 막힌다.
        """
        self._record_call()
        instruction = (
            f"{SUGGESTIONS_INSTRUCTION}\n\n{context}" if context else SUGGESTIONS_INSTRUCTION
        )
        create_kwargs: dict[str, Any] = {
            "model": self._model,
            # 짧은 목록 하나다. 길게 잡을 이유가 없고, 사용자가 화면을 보고 기다린다.
            "max_tokens": 512,
            "thinking": {"type": "disabled"},
            "output_config": {
                "effort": "low",
                "format": {"type": "json_schema", "schema": SUGGESTIONS_SCHEMA},
            },
            "messages": _to_messages(history, instruction, name=name),
        }
        resp = await self._client.messages.create(**create_kwargs)
        text = next((b.text for b in resp.content if getattr(b, "type", None) == "text"), "")
        return self._parse_suggestions(text)

    def _parse_suggestions(self, text: str) -> tuple[str, ...]:
        """**파싱 실패는 제안 없음이다.** 답변은 이미 나갔으므로 여기서 예외를
        올려 스트림을 끊을 이유가 없다."""
        try:
            data = json.loads(text)
            return tuple(str(q) for q in data.get("questions", []))
        except Exception:
            logger.warning("추천 질문 파싱 실패 — 제안 없이 넘어간다")
            return ()

    def _parse_triage(self, text: str) -> TriageResult:
        try:
            data = json.loads(text)
            qtype = QuestionType(data["question_type"])
            priorities = tuple(
                RoutePriority(
                    route=RouteId(p["route"]),
                    state=_state_of(p.get("state")),
                )
                for p in data.get("priorities", [])
            )
            return TriageResult(
                question_type=qtype,
                priorities=priorities,
                region=_region_of(data.get("region")),
            )
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
        name: str | None = None,
    ) -> AsyncIterator[GuidanceChunk]:
        self._record_call()
        system = build_system_prompt() + "\n\n" + context
        # **검색 도구는 항상 준다.** allow_web_search는 이제 "코드가 판정한
        # 허용"이 아니라 "이 경로에서 검색을 아예 막을 것인가"만 뜻한다.
        #
        # 예전에는 코드가 근거 검색 결과만 보고 미리 정했는데, 단어가 겹치는
        # 문서가 걸리기만 하면 답이 없어도 검색을 막았다. 문서에 답이 들어
        # 있는지는 읽어야 아는 것이라 코드가 알 수 없다.
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
            "messages": _to_messages(history, message, name=name),
        }
        if tools is not None:
            kwargs["tools"] = tools

        async with self._client.messages.stream(**kwargs) as stream:
            async for event in stream:
                if event.type == "content_block_start":
                    # 모델이 검색을 시작했다. **텍스트보다 먼저 나가야 하는 신호다.**
                    if getattr(event.content_block, "type", "") == "server_tool_use":
                        yield GuidanceChunk(web_search_started=True)
                elif event.type == "content_block_delta":
                    if getattr(event.delta, "type", "") == "text_delta":
                        yield GuidanceChunk(text=event.delta.text)

    async def extract_narrative_states(
        self, nodes: dict[str, str], narrative: str, *, name: str | None = None
    ) -> dict[str, NodeState]:
        self._record_call()
        # 온보딩 자유서술은 사용자가 자기 사정을 길게 쓰는 자리라 이름·연락처가 가장 잘 섞인다.
        masked_narrative = mask_text(narrative, name=name)
        assert_masked(masked_narrative)
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
            "messages": [{"role": "user", "content": masked_narrative}],
        }
        resp = await self._client.messages.create(**create_kwargs)
        text = next((b.text for b in resp.content if getattr(b, "type", None) == "text"), "")
        return self._parse_narrative(text, valid_ids=set(nodes))

    async def summarize_visit(self, *, text: str, name: str | None = None) -> str:
        """담당자가 먼저 읽는 요약을 만든다 (§7.4).

        **`_to_messages`를 지나지 않으므로 마스킹을 여기서 직접 건다.** 답변은
        선택지에서 고른 문장이 대부분이지만 자유 입력이 섞이는 문항이 있고,
        마스킹을 통과하지 못하면 요약을 포기한다 — 유스케이스가 그 실패를 받아
        상태로 남기고, 담당자는 답변 원문을 그대로 본다.

        스트리밍하지 않는다. 담당자는 완성된 것만 본다.
        """
        self._record_call()
        masked = mask_text(text, name=name)
        assert_masked(masked)
        create_kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": 512,
            "thinking": {"type": "disabled"},
            "output_config": {
                "effort": "low",
                # **조각으로 받는다.** 문단 하나로 받으면 담당자가 창구에서 훑지
                # 못하고, 화면도 제목과 줄로 나눌 수 없다.
                "format": {"type": "json_schema", "schema": SUMMARY_SCHEMA},
            },
            "system": SUMMARY_INSTRUCTION,
            "messages": [{"role": "user", "content": masked}],
        }
        resp = await asyncio.wait_for(
            self._client.messages.create(**create_kwargs),
            timeout=_SUMMARY_TIMEOUT_SECONDS,
        )
        text = next(
            (b.text for b in resp.content if getattr(b, "type", None) == "text"), ""
        )
        return normalize_summary(text)

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
