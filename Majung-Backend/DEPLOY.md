# Majung-Backend 배포 기록 (SSOT)

> 마중365 백엔드 AWS 배포. HailMary 패턴 재사용하되 **완전 격리**(별도 EC2·키·SG).
> 비밀(SESSION_SECRET 등)은 이 문서에 기록하지 않는다 — EC2 `.env`에만 존재.

## 확정 인프라

| 항목 | 값 |
|---|---|
| 리전 | ap-northeast-2 |
| EC2 인스턴스 | `i-04bc8c7b72f54d9ae` (t4g.micro, arm64, AL2023) |
| 고정 IP (EIP) | `3.34.251.223` (alloc `eipalloc-06e090cd4154e1863`) |
| 공개 API | **https://3-34-251-223.sslip.io** (sslip.io = 무료 IP→호스트명, 도메인/DNS 설정 불필요) |
| HTTPS | Caddy 자동 Let's Encrypt (발급·갱신 자동) |
| 보안그룹 | `sg-0e65887f93481d3fc` — 22←사용자 IP만 / 80·443←전체 |
| SSH 키 | **`C:\Users\skwog\Documents\freedom_project\majung_backend.pem`** (ed25519, gitignore됨). 공개키만 AWS import(`majung-backend`) |
| 앱 디렉토리 | EC2 `/home/ec2-user/majung-backend` |
| 서비스 | systemd `majung-backend`(uvicorn 127.0.0.1:8000) + `caddy` |
| LLM | **실 Claude API**(2026-08-23 전환). 지출 서킷브레이커와 rate limit이 방어한다 |
| 게이트 | 비활성. §2.3에서 폐지했고 대체 방어 셋이 맡는다 |
| IAM 인스턴스 롤 | 없음(훔칠 자격증명 0) / IMDSv2 강제 / EBS 암호화 |
| Frontend | Vercel `majung365.vercel.app` (Root Directory=Majung-Frontend) |
| DB | **Supabase** `jaqcgcysacajbjitdrnx` (서울). 모든 테이블 RLS 켜고 정책 없음 = 백엔드 service_role만 접근 |
| 실시간 | **Socket.IO** — Caddy `reverse_proxy`가 업그레이드를 자동 통과시킨다. 설정 추가 없음 |

## 보안 설계 (요금 폭탄 방어)

- **Mock LLM** → 유료 외부 호출 원천 0. 챗 남용해도 Claude 비용 0.
- SSH는 사용자 IP(`220.120.196.8/32`)만. 비번 로그인 없음(키 전용).
- **막혔을 때 거절 메시지로 원인을 가른다.** 둘을 섞으면 엉뚱한 곳을 고친다.

  ```
  Permission denied (publickey)   키가 틀렸다 — 위 $KEY 경로를 확인한다
  Connection timed out            IP가 막혔다 — 보안그룹 22번 인바운드를 갱신한다
  ```
- uvicorn은 localhost 바인딩 → Caddy만 외부 노출. 앱 포트 직접 노출 X.
- 인스턴스 롤 없음 + Mock → 박스에 고가치 비밀 없음(blast radius 최소).
- 계정 $50 예산 알람 기존 존재(skwogusdld@gmail.com).
- rate limit 20/min + 지출 서킷브레이커(백스톱).

## 운영 명령

**키는 이 레포에 없다.** 백엔드가 `freedom-backend`로 분리되기 전에 쓰인 상대 경로가
문서에 남아 있었는데 지금은 가리키는 곳이 없다. 아래 `$KEY`를 그대로 쓴다.

```bash
KEY="/c/Users/skwog/Documents/freedom_project/majung_backend.pem"   # Git Bash 기준

# SSH
ssh -i "$KEY" ec2-user@3.34.251.223

# 상태·로그
sudo systemctl status majung-backend caddy
sudo journalctl -u majung-backend -f
curl https://3-34-251-223.sslip.io/api/health   # {"status":"ok"}

# 코드 업데이트 (로컬에서 tar→scp→재시작)
cd Majung-Backend
tar czf /tmp/mb.tar.gz --exclude=.venv --exclude=.git --exclude='*cache*' app pyproject.toml uv.lock tests
scp -i "$KEY" /tmp/mb.tar.gz ec2-user@3.34.251.223:/tmp/
ssh -i "$KEY" ec2-user@3.34.251.223 \
  'cd ~/majung-backend && tar xzf /tmp/mb.tar.gz && ~/.local/bin/uv sync --python 3.12 && sudo systemctl restart majung-backend'
```

## 본선 환경변수 (저장 기능)

**셋이 모두 있어야 저장이 켜진다.** 하나라도 없으면 가입·방문 요청·채팅이 503이다.

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_KEY=<service_role JWT>
FIELD_ENCRYPTION_KEY=<base64 32바이트>
```

- `SUPABASE_SERVICE_KEY`는 **RLS를 무시하는 키다.** 서버에만 두고 클라이언트 번들에 넣지 않는다.
- `FIELD_ENCRYPTION_KEY`가 없으면 **부팅이 멈춘다.** 평문으로 저장하는 폴백은 두지 않는다(§9.2).
  키가 바뀌면 이미 저장된 이름·생일·출소날짜·대화를 읽지 못한다. 회전하려면 재암호화가 필요하다.

스키마는 `migrations/*.sql`에 있고 Supabase에 이미 적용되어 있다. 새 마이그레이션을 만들면
Supabase 콘솔이나 MCP로 적용한 뒤 파일로 남긴다.

## 실 Claude 키로 전환 (본선/유료)

1. EC2 `.env`에 `ANTHROPIC_API_KEY=sk-ant-...` 추가 + `USE_MOCK_LLM=false`
2. `sudo systemctl restart majung-backend`

**게이트를 켜지 않는다.** 기획서 §2.3에서 진입 게이트(코드 입력)를 폐지했다. 남용 방어는
게이트 대신 셋으로 나눠 맡는다.

| 위험 | 방어 | 상태 |
|---|---|---|
| LLM 호출 비용 남용 | 지출 서킷브레이커(시간·일 상한) | 구현됨 |
| 대량 요청 | IP 기준 rate limit | 구현됨 |
| 허위 방문 알림 | 하루 3건·미확정 5건 상한 + 담당자 승인 | 구현됨 (§7.5) |

**게이트 코드는 지우지 않았다.** `DEMO_ACCESS_CODE_HASH`가 비면 자동으로 꺼지는 구조라,
남용이 실제로 문제가 되면 환경변수 하나로 되살릴 수 있다.

## 담당자 계정 (§8.2)

해커톤 단계에서는 **우리가 발급한다.** 발급 API를 열지 않고 마이그레이션으로 넣는다 —
스스로 가입하는 길을 만들면 그게 곧 구멍이 된다. 관리자 앱은 정의상 출소자 명단을 만든다.

시연 계정 둘이 `migrations/0003_staff_account.sql`에 있다(공단·주민센터, 경기지부).
비밀번호는 scrypt 해시로만 저장되며 원문은 이 문서에 적지 않는다.

**세션은 8시간이다.** 출소자(90일)와 다른 기준이며 담당자 기기가 공용일 가능성을 전제한다.

## 배포 전 점검

| 항목 | 왜 |
|---|---|
| `CORS_ALLOW_LOCALHOST`를 끈다 | 개발 중 Expo 포트를 열어 둔 것이다. 스토어 앱이 localhost에서 붙을 일이 없다 |
| `ANTHROPIC_API_KEY`를 회전한다 | 개발 중 노출된 적이 있으면 반드시 |
| `SUPABASE_SERVICE_KEY`를 회전한다 | 같은 이유. RLS를 무시하는 키다 |
| 남은 테스트 데이터를 지운다 | 실사용자와 섞이기 전에 |

## 배포 후 확인

```bash
curl https://3-34-251-223.sslip.io/api/health              # {"status":"ok"}
curl "https://3-34-251-223.sslip.io/socket.io/?EIO=4&transport=polling"
# 0{"sid":"...","upgrades":["websocket"],...} 가 나와야 한다
```

부팅 로그에 아래가 보이면 저장이 켜진 것이다.

```
sudo journalctl -u majung-backend -n 50 | grep 💾
# 💾 저장 기능 켜짐 — 가입 정보는 암호화해 저장한다
```

## 완전 삭제 (teardown, 비용 정지)

```bash
R=ap-northeast-2
aws ec2 terminate-instances --region $R --instance-ids i-04bc8c7b72f54d9ae
aws ec2 release-address --region $R --allocation-id eipalloc-06e090cd4154e1863  # 인스턴스 종료 후
aws ec2 delete-security-group --region $R --group-id sg-0e65887f93481d3fc
aws ec2 delete-key-pair --region $R --key-name majung-backend
```
