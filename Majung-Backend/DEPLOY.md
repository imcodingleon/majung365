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
| SSH 키 | 로컬 `freedom_project/majung_backend.pem` (ed25519, gitignore됨). 공개키만 AWS import(`majung-backend`) |
| 앱 디렉토리 | EC2 `/home/ec2-user/majung-backend` |
| 서비스 | systemd `majung-backend`(uvicorn 127.0.0.1:8000) + `caddy` |
| LLM | **Mock**(USE_MOCK_LLM=true) — 실 Claude 호출 0, 지출 0 |
| 게이트 | 비활성(Mock이라 지출 리스크 없음). 실키 전환 시 반드시 활성화 |
| IAM 인스턴스 롤 | 없음(훔칠 자격증명 0) / IMDSv2 강제 / EBS 암호화 |
| Frontend | Vercel `majung365.vercel.app` (Root Directory=Majung-Frontend) |

## 보안 설계 (요금 폭탄 방어)

- **Mock LLM** → 유료 외부 호출 원천 0. 챗 남용해도 Claude 비용 0.
- SSH는 사용자 IP(`220.120.196.8/32`)만. 비번 로그인 없음(키 전용).
- uvicorn은 localhost 바인딩 → Caddy만 외부 노출. 앱 포트 직접 노출 X.
- 인스턴스 롤 없음 + Mock → 박스에 고가치 비밀 없음(blast radius 최소).
- 계정 $50 예산 알람 기존 존재(skwogusdld@gmail.com).
- rate limit 20/min + 지출 서킷브레이커(백스톱).

## 운영 명령

```bash
# SSH
ssh -i majung_backend.pem ec2-user@3.34.251.223

# 상태·로그
sudo systemctl status majung-backend caddy
sudo journalctl -u majung-backend -f
curl https://3-34-251-223.sslip.io/api/health   # {"status":"ok"}

# 코드 업데이트 (로컬에서 tar→scp→재시작)
cd Majung-Backend
tar czf /tmp/mb.tar.gz --exclude=.venv --exclude=.git --exclude='*cache*' app pyproject.toml uv.lock tests
scp -i ../majung_backend.pem /tmp/mb.tar.gz ec2-user@3.34.251.223:/tmp/
ssh -i ../majung_backend.pem ec2-user@3.34.251.223 \
  'cd ~/majung-backend && tar xzf /tmp/mb.tar.gz && ~/.local/bin/uv sync --python 3.12 && sudo systemctl restart majung-backend'
```

## 실 Claude 키로 전환 (본선/유료)

1. EC2 `.env`에 `ANTHROPIC_API_KEY=sk-ant-...` 추가 + `USE_MOCK_LLM=false`
2. **게이트 활성 필수**: `DEMO_ACCESS_CODE_HASH` 설정(+ 프론트 게이트 입력 UI) → 무방비 노출 방지
3. `sudo systemctl restart majung-backend`

## 완전 삭제 (teardown, 비용 정지)

```bash
R=ap-northeast-2
aws ec2 terminate-instances --region $R --instance-ids i-04bc8c7b72f54d9ae
aws ec2 release-address --region $R --allocation-id eipalloc-06e090cd4154e1863  # 인스턴스 종료 후
aws ec2 delete-security-group --region $R --group-id sg-0e65887f93481d3fc
aws ec2 delete-key-pair --region $R --key-name majung-backend
```
