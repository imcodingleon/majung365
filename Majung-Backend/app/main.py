"""FastAPI 진입점 — DI 와이어링은 여기서만.

Router → UseCase → Repository/LLM Port → Infrastructure 순으로 조립한다.
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.domains.account.adapter.inbound.api.router import router as account_router
from app.domains.account.application.usecase import SignupUseCase
from app.domains.account.infrastructure.client import (
    make_field_cipher,
    make_supabase_client,
)
from app.domains.account.infrastructure.supabase_repository import (
    SupabaseAccountRepository,
    SupabaseCrimeRepository,
    SupabaseSessionRepository,
)
from app.domains.centers.adapter.inbound.api.router import router as centers_router
from app.domains.centers.infrastructure.district_office_repository import (
    JsonDistrictOfficeRepository,
)
from app.domains.chat.adapter.inbound.api.router import router as chat_router
from app.domains.chat.adapter.outbound.external.claude_client import ClaudeChatLlm
from app.domains.chat.adapter.outbound.external.cli_client import CliChatLlm
from app.domains.chat.adapter.outbound.external.mock_client import MockChatLlm
from app.domains.chat.application.port import ChatLlm
from app.domains.chat.application.usecase import ChatUseCase
from app.domains.chat.infrastructure.message_repository import (
    SupabaseMessageRepository,
)
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
from app.domains.staff.adapter.inbound.api.router import router as staff_router
from app.domains.staff.infrastructure.supabase_repository import (
    SupabaseAccessLogRepository,
    SupabaseStaffRepository,
    SupabaseStaffSessionRepository,
)
from app.domains.visit.adapter.inbound.api.router import router as visit_router
from app.domains.visit.adapter.inbound.socket.server import create_socket_app
from app.domains.visit.application.chat_usecase import VisitChatUseCase
from app.domains.visit.application.usecase import VisitUseCase
from app.domains.visit.infrastructure.message_repository import (
    SupabaseMessageRepository as SupabaseVisitMessageRepository,
)
from app.domains.visit.infrastructure.supabase_repository import SupabaseVisitRepository
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
        allow_origin_regex=(
            r"http://localhost:\d+" if settings.cors_allow_localhost else None
        ),
        allow_credentials=False,
        # 실제로 여는 메서드만 적는다. **여기가 늦으면 브라우저에서만 막힌다** —
        # curl로는 되고 화면에서만 preflight가 400이라 원인을 찾기 어렵다.
        #   PATCH   내 정보 수정 · 담당자의 방문 요청 상태 변경
        #   DELETE  내 정보 삭제(§9.4) · 대화 내역 삭제
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # Rate limit
    app.state.limiter = limiter
    app.state.cors_origins = settings.cors_origins_list
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
    if settings.use_mock_llm:
        llm = MockChatLlm()
        logger.warning(
            "🤖 Mock LLM 사용 중 — 실제 Claude 호출 없음(무비용 데모). "
            "실 응답이 필요하면 .env에 ANTHROPIC_API_KEY 설정 + USE_MOCK_LLM=false"
        )
    elif settings.use_cli_llm:
        llm = CliChatLlm(model=settings.claude_model_alias)
        logger.warning(
            "🧪 Claude Code CLI로 호출 중 — **검증용이다.** 구독 크레딧을 쓰고 "
            "웹 검색이 꺼져 있다. 배포에는 ANTHROPIC_API_KEY를 쓴다"
        )
    elif not settings.anthropic_api_key:
        llm = MockChatLlm()
        logger.warning(
            "🤖 Mock LLM 사용 중 — API 키가 없다(무비용 데모). "
            "실 응답이 필요하면 .env에 ANTHROPIC_API_KEY 설정"
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
        passages=JsonRagRepository(cards=institutions.all()).index(),
        graph_nodes=graph_nodes,
        district_offices=JsonDistrictOfficeRepository(),
    )
    # llm은 StateExtractorLlm(C6)도 구조적으로 만족한다(extract_node_state 메서드 보유)
    app.state.intake_usecase = IntakeUseCase(
        institutions=institutions,
        rules=JsonIntakeRuleRepository().all(),
        blocking_routes=routes_blocking_others(graph_nodes),
        graph_nodes=graph_nodes,
    )
    # KB에 있으나 어떤 화면에도 닿지 않는 제도를 부팅 때 알린다.
    # 지원 항목에 걸어 두면 쓰인다고 믿기 쉬운데, 확인하지 않으면 알 길이 없다.
    unreachable = institutions.unreachable(app.state.intake_usecase.reachable_kb_refs())
    if unreachable:
        logger.warning(
            "📕 어느 화면에도 나가지 않는 제도 %d건: %s",
            len(unreachable),
            ", ".join(unreachable),
        )
    # 저장 기능은 설정이 갖춰졌을 때만 켠다. 없으면 signup_usecase가 없고
    # 라우터가 503으로 막는다 — 받아 두고 버리는 것이 가장 나쁘다.
    supabase = make_supabase_client(settings)
    if supabase is None:
        logger.warning(
            "💾 저장 기능 꺼짐 — SUPABASE_URL·SUPABASE_SERVICE_KEY가 없다. "
            "가입(POST /api/signup)은 503을 돌려준다"
        )
    else:
        cipher = make_field_cipher(settings)  # 키가 없으면 여기서 부팅이 멈춘다
        app.state.account_repo = SupabaseAccountRepository(supabase, cipher)
        app.state.crime_repo = SupabaseCrimeRepository(supabase, cipher)
        app.state.session_repo = SupabaseSessionRepository(supabase)
        app.state.message_repo = SupabaseMessageRepository(supabase, cipher)
        app.state.staff_repo = SupabaseStaffRepository(supabase)
        app.state.staff_session_repo = SupabaseStaffSessionRepository(supabase)
        app.state.access_log_repo = SupabaseAccessLogRepository(supabase)
        app.state.visit_repo = SupabaseVisitRepository(supabase, cipher)
        app.state.visit_usecase = VisitUseCase(
            visits=app.state.visit_repo,
            access_log=app.state.access_log_repo,
        )
        # 담당자 채팅(§7.3). 저장이 켜졌을 때만 연다 —
        # 대화를 남기지 못하는 채팅은 열어 두어도 소용이 없다.
        app.state.visit_chat_usecase = VisitChatUseCase(
            visits=app.state.visit_repo,
            messages=SupabaseVisitMessageRepository(supabase, cipher),
        )
        app.state.signup_usecase = SignupUseCase(
            accounts=app.state.account_repo,
            crimes=app.state.crime_repo,
            sessions=app.state.session_repo,
            intake=app.state.intake_usecase,
        )
        logger.info("💾 저장 기능 켜짐 — 가입 정보는 암호화해 저장한다")

    app.state.analyze_usecase = AnalyzeUseCase(
        llm=llm, institutions=institutions, graph_nodes=graph_nodes
    )
    app.state.gate = gate
    app.state.spend = spend

    # Routers
    app.include_router(chat_router)
    app.include_router(centers_router)
    app.include_router(account_router)
    app.include_router(staff_router)
    app.include_router(visit_router)
    app.include_router(onboarding_router)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


# **Socket.IO가 FastAPI를 감싼다.** REST는 그대로 지나가고 /socket.io만 소켓이
# 받는다. uvicorn이 실행하는 것은 이 앱이다.
app = create_socket_app(create_app())
