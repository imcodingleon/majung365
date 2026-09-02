"""Claude Code CLI 구현 — ChatLlm 포트. **검증용이지 배포용이 아니다.**

`claude -p`(headless)는 Claude 구독으로 프로그래밍 호출이 되는 공식 기능이다.
API 키를 붙이기 전에 실제 모델 응답을 보려고 쓴다 — Mock으로는 프롬프트가
의도대로 읽히는지, 마스킹된 입력으로도 답이 되는지 알 수 없다.

**배포에는 쓰지 않는다.** Anthropic 문서가 공유 프로덕션 자동화에는 API 키를
쓰라고 못박고 있고, 구독 크레딧은 개인 사용량에 묶인다. 배포는 claude_client.py다.

"Claude 호출은 adapter/outbound/external에서만"이라는 규칙(CLAUDE.md MUST 3)은
지킨다 — 이 파일이 그 안에 있고, 바깥 계층은 여전히 ChatLlm 포트만 안다.

보안: 사용자 입력은 stdin으로 넘긴다. 명령행 인자로 주면 프로세스 목록에 남는다.
마스킹은 여기서도 똑같이 건다 — 출구가 둘이면 한쪽만 막히는 날이 온다.
"""

import asyncio
import json
import logging
import shutil
from collections.abc import AsyncIterator
from typing import Any

from app.domains.chat.application.dto import Turn
from app.domains.chat.application.port import GuidanceChunk
from app.domains.chat.domain.prompts import (
    build_system_prompt,
    build_triage_instruction,
)
from app.domains.chat.domain.suggestions import SUGGESTIONS_INSTRUCTION
from app.domains.chat.domain.triage import (
    QuestionType,
    RoutePriority,
    TriageResult,
    UserRegion,
)
from app.domains.knowledge.domain.graph_engine import NodeState
from app.domains.shared.routes import RouteId
from app.domains.visit.domain.summary import SUMMARY_INSTRUCTION, normalize_summary
from app.infrastructure.security.masking import assert_masked, mask_text

logger = logging.getLogger("majung.cli")

# CLI는 기본으로 파일·셸 도구를 들고 있다. 우리 용도는 텍스트 생성뿐이라 전부 끈다 —
# 켜두면 모델이 답변 대신 레포를 뒤지기 시작한다.
_DISALLOWED_TOOLS = (
    "Bash Edit Write Read Glob Grep WebSearch WebFetch Task NotebookEdit"
)
_TIMEOUT_SECONDS = 120

# 응답을 어절 단위로 흘려 스트리밍처럼 보이게 한다. CLI가 한 번에 결과를 주므로
# 실제 토큰 스트림은 아니고, 스트리밍 자체는 claude_client.py에서 이미 동작한다.
_WORD_DELAY_SECONDS = 0.01


def _history_block(history: list[Turn], name: str | None) -> str:
    """지난 대화를 프롬프트에 붙일 형태로. assistant 턴도 마스킹한다 —
    이전 답변이 사용자 이름을 되받아 적었을 수 있다."""
    lines = []
    for turn in history:
        if turn.role not in ("user", "assistant"):
            continue
        who = "사용자" if turn.role == "user" else "도우미"
        lines.append(f"{who}: {mask_text(turn.content, name=name)}")
    return "\n".join(lines)


def _claude_path() -> str:
    """실행 파일 경로. Windows에서 claude는 npm 배치(claude.CMD)라 이름만으로는
    프로세스를 띄우지 못한다. which가 PATHEXT를 고려해 실제 파일을 찾아준다."""
    found = shutil.which("claude")
    if not found:
        raise RuntimeError("claude CLI를 찾지 못했다. npm 전역 설치와 PATH를 확인하라")
    return found


async def _run_claude(prompt: str, *, model: str) -> str:
    """`claude -p`를 돌려 결과 텍스트만 꺼낸다."""
    assert_masked(prompt)  # 전송 직전 안전망 — 새 경로가 마스킹을 건너뛰면 여기서 막힌다
    proc = await asyncio.create_subprocess_exec(
        _claude_path(),
        "-p",
        "--model",
        model,
        "--output-format",
        "json",
        "--disallowed-tools",
        _DISALLOWED_TOOLS,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(prompt.encode("utf-8")), timeout=_TIMEOUT_SECONDS
        )
    except TimeoutError:
        proc.kill()
        raise RuntimeError("claude CLI 응답이 시간을 넘겼다") from None

    if proc.returncode != 0:
        # 사용자 입력 원문은 로그에 남기지 않는다. stderr만 본다.
        logger.warning("claude CLI 실패(코드 %s): %s", proc.returncode, stderr.decode()[:300])
        raise RuntimeError("claude CLI 호출 실패")

    payload = json.loads(stdout.decode("utf-8"))
    if payload.get("is_error"):
        raise RuntimeError("claude CLI가 오류를 돌려줬다")
    result = payload.get("result", "")
    return result if isinstance(result, str) else ""


def _extract_json(text: str) -> dict[str, Any]:
    """모델이 코드 펜스로 감싸 주는 경우가 있어 중괄호 구간만 떼어낸다."""
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("JSON을 찾지 못했다")
    parsed = json.loads(text[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("JSON 객체가 아니다")
    return parsed


def _rows(data: dict[str, Any], key: str) -> list[dict[str, Any]]:
    """모델 응답에서 dict 목록만 꺼낸다. 형태가 어긋나면 빈 목록으로 넘긴다 —
    파싱 실패가 대화를 멈추면 안 된다."""
    value = data.get(key)
    if not isinstance(value, list):
        return []
    return [row for row in value if isinstance(row, dict)]


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
    """모델이 낸 상태 문자열을 값으로. 모르면 X다."""
    try:
        return NodeState(str(raw))
    except ValueError:
        return NodeState.X


class CliChatLlm:
    """`claude -p`로 답을 받는 ChatLlm 구현. 검증용."""

    def __init__(self, model: str = "sonnet") -> None:
        self._model = model

    async def triage(
        self,
        message: str,
        history: list[Turn],
        *,
        name: str | None = None,
        route_label: str = "",
    ) -> TriageResult:
        masked = mask_text(message, name=name)
        prompt = (
            f"{build_triage_instruction(route_label)}\n\n"
            "아래 형식의 JSON만 출력하세요. 다른 말은 붙이지 마세요.\n"
            '{"question_type": "support" 또는 "daily", '
            '"priorities": [{"route": "R1"}, ...]}\n\n'
            f"사용자의 마지막 메시지: {masked}"
        )
        try:
            raw = await _run_claude(prompt, model=self._model)
            data = _extract_json(raw)
            qtype = QuestionType(str(data.get("question_type", "daily")))
            priorities = tuple(
                RoutePriority(
                    route=RouteId(str(row["route"])),
                    state=_state_of(row.get("state")),
                )
                for row in _rows(data, "priorities")
                if "route" in row
            )
            return TriageResult(
                question_type=qtype,
                priorities=priorities,
                region=_region_of(data.get("region")),
            )
        except Exception:
            # 실 API와 같은 폴백 — triage가 실패해도 챗은 계속 답한다
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
        # 웹 검색은 켜지 않는다. CLI에서는 도메인 화이트리스트를 강제할 수 없어서,
        # 공공 도메인 한정이라는 규칙(MUST 9)이 깨진다. 검증 목적에는 텍스트면 충분하다.
        parts = [build_system_prompt(), context]
        past = _history_block(history, name)
        if past:
            parts.append(f"[지난 대화]\n{past}")
        parts.append(f"[사용자의 말]\n{mask_text(message, name=name)}")
        text = await _run_claude("\n\n".join(parts), model=self._model)

        buf = ""
        for ch in text:
            buf += ch
            if ch in (" ", "\n"):
                yield GuidanceChunk(text=buf)
                buf = ""
                await asyncio.sleep(_WORD_DELAY_SECONDS)
        if buf:
            yield GuidanceChunk(text=buf)

    async def suggest_questions(
        self, history: list[Turn], *, context: str = "", name: str | None = None
    ) -> tuple[str, ...]:
        """이어서 물어볼 만한 질문 (§6.1). **`_history_block`이 마스킹을 건다.**"""
        parts = [SUGGESTIONS_INSTRUCTION]
        if context:
            parts.append(context)
        parts.append(
            "아래 형식의 JSON만 출력하세요. 다른 말은 붙이지 마세요.\n"
            '{"questions": ["...?", "...?", "...?"]}'
        )
        past = _history_block(history, name)
        if past:
            parts.append(f"[지난 대화]\n{past}")
        try:
            raw = await _run_claude("\n\n".join(parts), model=self._model)
            data = _extract_json(raw)
            questions = data.get("questions", [])
            if not isinstance(questions, list):
                return ()
            return tuple(str(q) for q in questions)
        except Exception:
            # 답변은 이미 나갔다. 제안이 없다고 대화가 끊기면 안 된다.
            logger.warning("추천 질문 파싱 실패 — 제안 없이 넘어간다")
            return ()

    async def summarize_visit(self, *, text: str, name: str | None = None) -> str:
        """담당자가 먼저 읽는 요약 (§7.4). 실 API 경로와 같은 프롬프트를 쓴다."""
        prompt = "\n\n".join([
            SUMMARY_INSTRUCTION,
            "아래 형식의 JSON만 출력하세요. 다른 말은 붙이지 마세요.",
            '{"headline": "...", "points": [{"label": "...", "text": "..."}], '
            '"prepare": ["..."]}',
            mask_text(text, name=name),
        ])
        return normalize_summary(await _run_claude(prompt, model=self._model))

    async def extract_narrative_states(
        self, nodes: dict[str, str], narrative: str, *, name: str | None = None
    ) -> dict[str, NodeState]:
        node_list = "\n".join(f"- {nid}: {name}" for nid, name in nodes.items())
        prompt = (
            "아래 목록 중 사용자의 글에서 실제로 언급됐거나 명확히 유추할 수 있는 항목만 "
            "상태를 판정하세요.\n\n"
            f"목록:\n{node_list}\n\n"
            "상태: O(있고 쓸 수 있다) / X(없다) / BLOCKED(있지만 정지·분실로 못 쓴다)\n"
            "언급되지 않은 항목은 넣지 마세요. 애매하면 넣지 마세요.\n\n"
            '아래 형식의 JSON만 출력하세요: {"mentions": [{"node_id": "...", "state": "O"}]}\n\n'
            f"사용자의 글: {mask_text(narrative, name=name)}"
        )
        try:
            raw = await _run_claude(prompt, model=self._model)
            data = _extract_json(raw)
            result: dict[str, NodeState] = {}
            for row in _rows(data, "mentions"):
                node_id = str(row.get("node_id", ""))
                if node_id not in nodes:
                    continue
                try:
                    result[node_id] = NodeState(str(row.get("state")))
                except ValueError:
                    continue
            return result
        except Exception:
            logger.warning("서술 상태 판정 실패 — 버튼 답변만 사용")
            return {}

    async def order_tasks(self, payload: str) -> tuple[str, ...]:
        """**CLI 경로는 순서를 정하지 않는다.**

        빈 튜플을 주면 부르는 쪽이 정해 둔 순서로 물러난다. 이 클라이언트는 응답
        품질을 눈으로 보려고 두는 검증용이라, 가입 흐름 안에서 도는 순서 결정까지
        여기로 끌어오면 확인하려던 것과 다른 것을 보게 된다.
        """
        return ()

