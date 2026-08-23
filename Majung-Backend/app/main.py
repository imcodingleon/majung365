"""FastAPI 진입점 — DI 와이어링은 여기서만.

Router → UseCase → Repository/LLM Port → Infrastructure 순으로 조립한다.
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.domains.centers.adapter.inbound.api.router import router as centers_router
from app.domains.chat.adapter.inbound.api.router import router as chat_router
from app.domains.chat.adapter.outbound.external.claude_client import ClaudeChatLlm
from app.domains.chat.adapter.outbound.external.mock_client import MockChatLlm
from app.domains.chat.application.port import ChatLlm
from app.domains.chat.application.usecase import ChatUseCase
from app.domains.knowledge.adapter.inbound.api.router import router as onboarding_router
from app.domains.knowledge.application.intake_usecase import IntakeUseCase
from app.domains.knowledge.application.usecase import AnalyzeUseCase
from app.domains.knowledge.domain.graph_engine import routes_blocking_others
from app.domains.knowledge.infrastructure.graph_repository import JsonGraphRepository
from app.domains.knowledge.infrastructure.intake_rules_repository import (
    JsonIntakeRuleRepository,
)
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository
from app.domains.knowledge.infrastructure.rag_repository import JsonRagRepository
from app.infrastructure.config.settings import Settings, get_settings
from app.infrastructure.security.gate import AccessGate
from app.infrastructure.security.rate_limit import limiter
from app.infrastructure.security.spend import SpendCircuitBreaker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("majung.boot")

_DEFAULT_SESSION_SECRET = "dev-only-secret-change-me"


def _assert_gate_safe(gate: AccessGate, settings: Settings) -> None:
    """부팅 시 게이트 안전성 검증 — fail-open/위조 토큰 조합을 막는다.

    - 게이트 활성인데 SESSION_SECRET이 공개 기본값이면: 토큰 위조 가능 → 기동 거부.
    - 게이트 비활성(코드 해시 없음)이면: /api/chat 무방비 → 큰 경고(로컬 개발 전용).
    """
    if gate.enabled and settings.session_secret == _DEFAULT_SESSION_SECRET:
        raise RuntimeError(
            "SESSION_SECRET이 공개 기본값입니다 — 게이트가 켜져도 토큰을 위조할 수 있어요. "
            ".env에 임의의 SESSION_SECRET을 설정하세요."
        )
    if not gate.enabled:
        logger.warning(
            "⚠️ 접근 게이트 비활성(DEMO_ACCESS_CODE_HASH 미설정) — /api/chat이 무방비입니다. "
            "배포 전 반드시 설정하세요. (로컬 개발에서만 허용)"
        )


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="마중365 API", version="0.1.0")

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    # Rate limit
    app.state.limiter = limiter
    # slowapi 핸들러 시그니처는 Starlette 타입과 미세 불일치(외부 라이브러리 경계)
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

    # ── DI 와이어링 ──
    institutions = JsonInstitutionRepository()
    spend = SpendCircuitBreaker(
        max_per_hour=settings.spend_max_calls_per_hour,
        max_per_day=settings.spend_max_calls_per_day,
    )
    # 실제 Claude 호출마다 지출 카운트(콜 단위). 라우터는 스트림 전 check()로 조기 차단.
    # 키가 없거나 USE_MOCK_LLM=true면 무비용 Mock 사용(외부 호출 0).
    llm: ChatLlm
    if settings.use_mock_llm or not settings.anthropic_api_key:
        llm = MockChatLlm()
        logger.warning(
            "🤖 Mock LLM 사용 중 — 실제 Claude 호출 없음(무비용 데모). "
            "실 응답이 필요하면 .env에 ANTHROPIC_API_KEY 설정 + USE_MOCK_LLM=false"
        )
    else:
        llm = ClaudeChatLlm(settings, record_call=spend.record)
    gate = AccessGate(settings)
    _assert_gate_safe(gate, settings)

    graph_nodes = JsonGraphRepository().nodes()
    app.state.chat_usecase = ChatUseCase(
        llm=llm,
        institutions=institutions,
        blocking_routes=routes_blocking_others(graph_nodes),
        passages=JsonRagRepository().index(),
    )
    # llm은 StateExtractorLlm(C6)도 구조적으로 만족한다(extract_node_state 메서드 보유)
    app.state.intake_usecase = IntakeUseCase(
        institutions=institutions,
        rules=JsonIntakeRuleRepository().all(),
        blocking_routes=routes_blocking_others(graph_nodes),
    )
    app.state.analyze_usecase = AnalyzeUseCase(
        llm=llm, institutions=institutions, graph_nodes=graph_nodes
    )
    app.state.gate = gate
    app.state.spend = spend

    # Routers
    app.include_router(chat_router)
    app.include_router(centers_router)
    app.include_router(onboarding_router)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
