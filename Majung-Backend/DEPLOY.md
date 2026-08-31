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
| 보안그룹 | `sg-0e65887f93481d3fc` — 22←작업자 IP만(**한 줄만 유지한다**) / 80·443←전체 |
| 앱 `.env` | EC2 **`/home/ec2-user/majung-backend/.env`**. `ANTHROPIC_API_KEY`가 여기 있다 — 로컬 어디에도 없다 |
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

- **실 Claude API가 돌고 있다.** 유료 호출이 실제로 나가며, 방어는 지출 서킷브레이커와
  rate limit이 맡는다.

  > ⚠️ **여기에 "Mock LLM → 유료 호출 0"이라고 적혀 있었다.** 2026-08-23에 실 키로
  > 전환하면서 위 인프라 표(`LLM` 행)만 고치고 이 줄을 안 고쳤다. 그 결과 2026-08-31
  > 세션이 **"배포 서버가 목업이라 확인이 안 된다"고 잘못 판단**했다. 실제로는
  > EC2 `.env`에 `ANTHROPIC_API_KEY`가 있고 `USE_MOCK_LLM=false`다.
  >
  > **로컬과 서버가 다르다.** 로컬 `Majung-Backend/.env`는 `USE_MOCK_LLM=true`이고
  > Claude 키가 아예 없다 — 키는 **EC2에만** 있다. 로컬에서 띄우면 목업 문구만
  > 나오므로 프롬프트 변경은 로컬로 확인되지 않는다.
- SSH는 **작업하는 사람의 IP만** 연다. 비번 로그인 없음(키 전용).

  **IP 값을 여기에 적지 않는다.** 집·회사·모바일 테더링에 따라 바뀌고, 실제로 문서에
  적힌 값이 두 번 어긋난 채로 남아 있었다(`220.120.196.8` → `61.77.23.157` → …).
  아래로 그때그때 갱신한다.

  > **막히면 열려 있는 목록부터 본다.** 22번에 옛 IP만 남아 있어 `Connection timed out`이
  > 나는 것이 흔한 모양이다. **연 뒤에는 안 쓰는 IP를 그 자리에서 지운다** — 유동 IP라
  > 옛 값은 지금 다른 사람에게 넘어가 있을 수 있다. 키가 없으면 못 들어오지만 열어 둘
  > 이유도 없다. (2026-08-31에 `220.120.54.135/32`를 이 이유로 지웠다.)

  ```bash
  G=sg-0e65887f93481d3fc
  MYIP=$(curl -s https://checkip.amazonaws.com | tr -d '\r\n')

  # 지금 열린 목록
  aws ec2 describe-security-groups --region ap-northeast-2 --group-ids $G \
    --query "SecurityGroups[0].IpPermissions[?FromPort==\`22\`].IpRanges[].CidrIp" --output text

  # 내 IP 열기
  aws ec2 authorize-security-group-ingress --region ap-northeast-2 \
    --group-id $G --protocol tcp --port 22 --cidr $MYIP/32

  # 안 쓰는 IP 닫기 — 열어 둔 채 두지 않는다. 서버에 출소자 정보가 쌓인다
  aws ec2 revoke-security-group-ingress --region ap-northeast-2 \
    --group-id $G --protocol tcp --port 22 --cidr <옛IP>/32
  ```
- **막혔을 때 거절 메시지로 원인을 가른다.** 둘을 섞으면 엉뚱한 곳을 고친다.

  ```
  Permission denied (publickey)   키가 틀렸다 — 위 $KEY 경로를 확인한다
  Connection timed out            IP가 막혔다 — 보안그룹 22번 인바운드를 갱신한다
  ```
- uvicorn은 localhost 바인딩 → Caddy만 외부 노출. 앱 포트 직접 노출 X.
- 인스턴스 롤 없음(훔칠 AWS 자격증명 0). **다만 박스에 Claude 키·Supabase service_role 키·
  필드 암호화 키가 있다.** "Mock이라 고가치 비밀 없음"은 전환 전 이야기다.
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

## 프론트 환경변수 (Vercel)

| 이름 | 어디에 |
|---|---|
| `EXPO_PUBLIC_API_URL` | 저장소 `vercel.json`의 `buildCommand`에 값이 그대로 적혀 있다. 공개 주소라 숨길 것이 없다 |
| `EXPO_PUBLIC_GOOGLE_MAPS_KEY` | **Vercel 프로젝트 환경변수에 넣는다.** 파일에 적지 않는다 |

**`vercel.json`을 고칠 필요가 없다.** expo가 빌드할 때 `EXPO_PUBLIC_` 접두사가 붙은
환경변수를 알아서 번들에 싣는다. Vercel 대시보드에서 값을 넣기만 하면 다음 배포부터
들어간다.

> **키가 없으면 지도 자리에 "지도를 불러오지 못했어요"가 나온다.** 목록·검색·전화·
> 길찾기는 그대로 동작하므로 화면이 죽지는 않는다. 실제로 첫 배포에서 이 상태였다.

**이 키는 웹 번들에 그대로 박힌다.** 숨길 수 없으므로 방어는 구글 콘솔의 제한이 맡는다.

- 웹사이트 제한: `https://majung365.vercel.app/*` · `http://localhost:19006/*` · `http://localhost:8081/*`
- API 제한: Maps JavaScript API 하나만
- **Geocoding은 이 키에 허용하지 않는다.** 기관 좌표를 채울 때는 별도 키를 만들어 쓰고
  끝나면 지운다 (`tools/fill_coordinates.py`)

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

**`0011_chat_suggestions.sql`은 코드 배포보다 먼저 적용한다.** 컬럼이 없는 채로 새 코드가
올라가도 저장·조회는 살아남게 폴백을 두었지만(`chat/infrastructure/message_repository.py`),
그 폴백이 도는 동안에는 추천 질문이 남지 않는다.

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
