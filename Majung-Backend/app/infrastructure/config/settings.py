"""전역 설정 — 환경변수의 유일한 진입점 (Pydantic BaseSettings).

Domain/Application 레이어에서 os.environ 직접 접근 금지. 여기서만 읽는다.
비밀(API 키·게이트 코드 해시·세션 시크릿)은 .env 로만 주입되며 커밋되지 않는다.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ── Claude API ──
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-5"
    # 웹 검색 허용 도메인 (일상 질문용, 공공 도메인만). 쉼표 구분.
    web_search_allowed_domains: str = (
        "gov.kr,korea.kr,bokjiro.go.kr,work24.go.kr,koreha.or.kr,mohw.go.kr,moel.go.kr"
    )
    web_search_max_uses: int = 3

    # ── 접근 게이트 (남용 방어 ①) ──
    # 데모 진입 코드의 해시(sha256 hex). 평문 코드는 저장하지 않는다.
    demo_access_code_hash: str = ""
    # 게이트 통과 후 발급하는 서명 토큰용 시크릿 + 만료(초)
    session_secret: str = "dev-only-secret-change-me"
    session_ttl_seconds: int = 60 * 60 * 6  # 6시간

    # ── Rate limit (남용 방어 ②) ──
    rate_limit_chat: str = "20/minute"  # 신뢰 사용자 볼륨 걱정 없어 느슨
    rate_limit_gate: str = "10/minute"  # 게이트 코드 무한 대입 방지(빡빡)

    # ── 지출 서킷브레이커 (남용 방어 ③, 백스톱) ──
    spend_max_calls_per_hour: int = 300
    spend_max_calls_per_day: int = 2000

    # ── CORS ──
    cors_origins: str = "http://localhost:8081,http://localhost:19006"

    @property
    def web_search_domains_list(self) -> list[str]:
        return [d.strip() for d in self.web_search_allowed_domains.split(",") if d.strip()]

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
