-- 담당자 계정 — 기획서 §8.2 (해커톤 단계 결정, 2026-08-23)
--
-- 출소자는 가입만으로 쓰지만 담당자는 계정이 필요하다. 지금 단계에서는 **우리가
-- 발급한다** — 공단 협조 절차가 정해지기 전까지의 임시 방식이고, 발급 API를 열지
-- 않고 마이그레이션으로 넣는다. 스스로 가입하는 길을 만들면 그게 곧 구멍이 된다.
--
-- **담당자 정보는 개인정보로 다루지 않는다**(이 단계의 결정). 공단·주민센터 직원의
-- 업무 계정이고 이름 대신 소속과 표시명만 둔다. 그래서 암호화 컬럼이 없다.
-- 나중에 실명이 들어오면 그때 등급을 다시 잡아야 한다.

create table if not exists staff_account (
  id uuid primary key default gen_random_uuid(),

  login_id text not null unique,

  -- 비밀번호는 해시만 둔다. 원문을 저장하면 DB 유출이 곧 전 계정 탈취다.
  -- 사람이 정한 비밀번호는 사전 공격의 대상이라 느린 해시(scrypt)를 쓴다 —
  -- 세션 토큰이 고엔트로피 난수라 sha256으로 충분한 것과 다른 상황이다.
  password_hash text not null,

  -- 어느 기관 사람인가. 방문 요청이 항목(R번호)에 따라 갈리므로 이 값으로 받는다.
  --   koreha  = 한국법무보호복지공단
  --   center  = 주민센터·행정복지센터
  org_kind text not null check (org_kind in ('koreha', 'center')),

  -- 소속 지부·기관. 지부 필터가 켜지면 이 값으로 거른다.
  branch text not null default '',

  -- 화면에 보이는 이름. 실명이 아니라 "경기지부 담당자" 같은 표시용이다.
  display_name text not null,

  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

comment on table staff_account is
  '담당자 계정. 해커톤 단계에서는 우리가 발급하고 스스로 가입하는 길을 두지 않는다. 담당자 정보는 개인정보로 다루지 않는다 — 업무 계정이고 실명이 들어가지 않는다.';

create index if not exists staff_account_org_idx
  on staff_account (org_kind, branch)
  where disabled_at is null;

-- 담당자 세션. 출소자 세션과 같은 방식이되 **만료가 훨씬 짧다.**
-- §8.2가 "담당자 기기가 공용일 가능성을 전제한다"고 못박고 있어서,
-- 자리를 비운 사이 명단이 열려 있으면 안 된다.
create table if not exists staff_session (
  token_hash text primary key,
  staff_id uuid not null references staff_account (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists staff_session_staff_idx on staff_session (staff_id);

-- 열람 감사 로그 — §8.2의 전제 조건 셋째.
--
-- **누가 언제 어떤 출소자의 정보를 열었는지 기록한다. 사후에 추적할 수 없으면
-- 통제가 아니다.** 관리자 앱은 정의상 "출소자 명단"을 만들기 때문에, 이 기록이
-- 없으면 열람 권한이 사실상 무제한과 같아진다.
create table if not exists staff_access_log (
  id bigserial primary key,
  staff_id uuid not null references staff_account (id) on delete cascade,

  -- 대상 출소자. 계정이 지워져도 로그는 남아야 하므로 외래키를 걸지 않는다 —
  -- 지운 뒤에 "누가 그 사람 정보를 봤나"를 물을 수 있어야 한다.
  target_user_id uuid,

  action text not null,  -- list | detail | chat | ...
  at timestamptz not null default now()
);

create index if not exists staff_access_log_staff_idx on staff_access_log (staff_id, at desc);
create index if not exists staff_access_log_target_idx on staff_access_log (target_user_id, at desc);

alter table staff_account    enable row level security;
alter table staff_session    enable row level security;
alter table staff_access_log enable row level security;
