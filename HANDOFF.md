# 마중365 — 출장 이어작업 인수인계

> 이 파일은 노트북에서 클론하면 같이 따라옵니다. 위에서부터 순서대로 하면 됩니다.
> 작성 2026-07-06 (데스크탑에서 백엔드 스캐폴드+코드리뷰 완료 시점)

## 지금까지 어디까지 됐나

- ✅ **백엔드(Majung-Backend) 완성 + 코드리뷰까지 done** — FastAPI, SSE 챗(triage→text→card→done), 제도 KB, 센터 API, 남용 방어(게이트·rate·spend), 보안 하드닝. `ruff 0 / mypy 0 / pytest 21 passed + 3 skipped`
- ⬜ **프론트엔드(Majung-Frontend)** — 아직 스캐폴드 전. CLAUDE.md만 있음. **다음 작업 = 여기.**
- 리포: https://github.com/imcodingleon/majung365 (private) — 모든 게 여기 있음(코드·스펙·bmad 스킬·memlog)

## 1) 노트북에 설치 (약 10분)

| 도구 | 용도 | 설치 |
|---|---|---|
| Git | 필수 | (이미 있을 것) |
| Claude Code CLI | 필수 | 같은 계정으로 로그인 |
| Node.js LTS | 프론트(Expo) + gh | nodejs.org LTS |
| uv | 백엔드 Python | `powershell -c "irm https://astral.sh/uv/install.ps1 | iex"` |
| gh CLI | 리포 조작(선택) | `gh auth login` |

Python은 uv가 알아서 받습니다. Expo는 `npx`라 별도 설치 없음.

## 2) 클론 + 백엔드 복구 확인

```bash
gh auth login                       # 같은 계정(imcodingleon)
git clone https://github.com/imcodingleon/majung365
cd majung365/Majung-Backend
uv sync
uv run pytest                       # 21 passed, 3 skipped 나오면 정상
```

3 skipped = 실키 필요한 triage 통합테스트(정상). `ruff`/`mypy`도 통과해야 함.

## 3) Claude Code 플러그인 재설치 (유저 스코프라 기계별)

bmad-* 스킬은 리포에 있어 클론만으로 됩니다. 아래만 다시 설치:

```
claude plugin install figma@claude-plugins-official
```
그리고 `/plugin`으로 **context7**, **frontend-design** 설치 → `/reload-plugins`.

- **Figma MCP 인증**: 첫 사용 시 브라우저 인증 1회(기계별). 디자인 시안 파일: `h97VLfum9A07yPPwS0bJQq`
- 모델은 `/model`로 **Opus 4.8**(또는 원하는 것) 선택

## 4) 이어서 할 일 (Claude에게 이 한 줄이면 재개)

> **"HANDOFF.md 읽고, spec-majung-demo 기준으로 프론트엔드 2단계 시작해줘"**

- 정본 계약: `_bmad-output/specs/spec-majung-demo/` (SPEC.md + design-map.md + stack.md + demo-scenario.md)
- 진행 기록: `_bmad-output/specs/spec-majung-demo/.memlog.md` (지금까지의 모든 결정)
- 프론트 규칙: `Majung-Frontend/CLAUDE.md` (Expo + expo-router 5탭 + NativeWind, Frontend DDD)
- 화면 우선순위(팀 확정): 챗봇 → 로드맵 → 지도(폴백) → 온보딩

## 5) 실키 도착하면

`.env`는 git에 안 올라갑니다. `Majung-Backend/.env.example`을 복사해 `.env` 만들고 채우기:

- `ANTHROPIC_API_KEY` = 주최측 발급 키
- `DEMO_ACCESS_CODE_HASH` = `python -c "import hashlib;print(hashlib.sha256('원하는코드'.encode()).hexdigest())"`
- **`SESSION_SECRET` = 반드시 임의 랜덤값** ⚠️ (기본값 그대로면 서버가 기동 거부함 — 보안 하드닝)

그다음 triage 실검증:
```bash
cd Majung-Backend && uv run pytest tests/test_triage_integration.py   # 3 skipped → 통과로 바뀌어야
uv run uvicorn app.main:app --port 8000                               # 로컬 서버
```

## 6) 남은 큰 그림

| 단계 | 상태 |
|---|---|
| 백엔드 | ✅ done (리뷰 포함) |
| **프론트엔드** | ⬜ **다음** (Expo 스캐폴드 → 5탭 → 챗/로드맵/지도/온보딩) |
| KB·센터 데이터 검수 | ⬜ `institutions.json`·`centers.json`은 **공개정보 초안** — 7/8 공단 인터뷰 후 실값으로 (파일 헤더에 경고 있음) |
| 배포 | FE=Vercel(Root Dir=Majung-Frontend) / BE=AWS EC2 |
| 제출 | 7/10 13:00 |

## 참고 (기계별이라 안 따라오는 것)

- **Obsidian 노트**(`출소자 지원 서비스/` 폴더, BMad 가이드): 볼트가 노트북에 동기화돼 있어야 접근 가능. 안 되면 노션/이 리포 문서로 대체 — 작업엔 지장 없음.
- **~/.claude 메모리**: 기계별. 핵심 규칙(보안 1번, SSOT 위치)은 이 리포의 CLAUDE.md들에 있어서 자동 적용됨.
- **Notion MCP**: claude.ai 계정 연동이라 로그인하면 대체로 따라옴.
