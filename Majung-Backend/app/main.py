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
from app.domains.chat.application.usecase import ChatUseCase
from app.domains.knowledge.infrastructure.json_repository import JsonInstitutionRepository
from app.infrastructure.config.settings import get_settings
from app.infrastructure.security.gate import AccessGate
from app.infrastructure.security.rate_limit import limiter
from app.infrastructure.security.spend import SpendCircuitBreaker

logging.basicConfig(level=logging.INFO)


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
    llm = ClaudeChatLlm(settings)
    app.state.chat_usecase = ChatUseCase(llm=llm, institutions=institutions)
    app.state.gate = AccessGate(settings)
    app.state.spend = SpendCircuitBreaker(
        max_per_hour=settings.spend_max_calls_per_hour,
        max_per_day=settings.spend_max_calls_per_day,
    )

    # Routers
    app.include_router(chat_router)
    app.include_router(centers_router)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
