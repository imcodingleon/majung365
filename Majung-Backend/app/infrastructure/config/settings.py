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
    # Mock LLM 강제 사용(무비용 데모). 미설정이어도 키가 없으면 자동으로 Mock 사용.
    use_mock_llm: bool = False
    # Claude Code CLI(`claude -p`)로 호출한다. **검증용이다** — API 키를 붙이기 전에
    # 실제 모델 응답을 보려는 용도이고, 배포에는 쓰지 않는다(구독 크레딧에 묶인다).
    use_cli_llm: bool = False
    # CLI에 넘길 모델 별칭(sonnet·opus·fable). 실 API의 claude_model과 별개다 —
    # CLI는 모델 ID가 아니라 별칭을 받는다.
    claude_model_alias: str = "sonnet"
    # 웹 검색 허용 도메인 (기획서 §6.4 확정, 24개). 쉼표 구분.
    #
    # 기존 7개로는 수집한 근거 문서의 절반 가까운 도메인에 접근할 수 없었다 —
    # RAG는 교정본부의 출소증명서 안내를 근거로 쓰는데 웹 검색은 같은 사이트에 못 갔다.
    #
    # **지자체 2곳(gb.go.kr·songpa.go.kr)은 근거로만 쓰고 검색에서는 뺀다.**
    # 근거로 쓸 때는 어느 지자체 자료인지 우리가 알고 화면에 표시할 수 있지만,
    # 검색은 무엇이 걸려 올지 통제되지 않는다. 부산 사용자에게 송파구 기준 구비서류가
    # 나가면 사용자는 그것이 자기 지역 기준이 아니라는 것을 알 방법이 없다.
    #
    # 민간 금융 2곳은 이 둘만 명시적으로 연다. 은행 도메인 일반으로 넓히지 않는다.
    web_search_allowed_domains: str = ",".join(
        (
            # 법령·법률
            "law.go.kr", "easylaw.go.kr", "helplaw24.go.kr",
            # 법원·회생파산
            "slb.scourt.go.kr", "ecfs.scourt.go.kr",
            # 법무·교정
            "moj.go.kr", "corrections.go.kr", "kics.go.kr", "koreha.or.kr",
            # 복지·보건
            "bokjiro.go.kr", "mohw.go.kr", "nhis.or.kr",
            # 고용
            "work24.go.kr", "moel.go.kr",
            # 행정
            "gov.kr", "korea.kr", "mois.go.kr",
            # 주거
            "lh.or.kr",
            # 금융·채무
            "fsc.go.kr", "ccrs.or.kr", "payinfo.or.kr", "epostbank.go.kr",
            # 민간 금융 (예외 2건 — 상업 정보라 기관명을 반드시 표시한다)
            "obank.kbstar.com", "shinhangroup.com",
        )
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
