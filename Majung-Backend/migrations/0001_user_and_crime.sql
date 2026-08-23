-- 가입 정보 스키마 — 기획서 §9
--
-- 무엇이 어디에 들어가는지가 §9.1의 등급 분류를 그대로 따른다.
--   민감정보 준용(죄목)  → 별도 테이블 + 컬럼 암호화 + 동의 플래그
--   고민감 식별정보       → 컬럼 암호화 (이름·생일·출소날짜)
--   일반                  → 평문 (동의 이력·완료 여부)
--   미저장                → 위치 좌표. 여기 컬럼 자체가 없다
--
-- **암호화는 앱에서 한다.** pgcrypto를 쓰면 키가 DB 안에 있게 되어, DB나 백업이
-- 유출됐을 때 암호문만 나가야 한다는 전제가 무너진다(§9.2). 그래서 아래 _enc
-- 컬럼은 전부 base64 문자열이고 DB는 그 안을 모른다.
--
-- **암호화된 컬럼으로는 검색도 정렬도 못 한다.** 같은 평문이라도 매번 다른 암호문이
-- 나오기 때문이다. 이름으로 사용자를 찾는 기능은 이 구조에서 만들 수 없고 의도한
-- 제약이다.

-- ── 사용자 ──
create table if not exists app_user (
  id uuid primary key default gen_random_uuid(),

  -- 고민감 식별정보. 앱에서 AES-256-GCM으로 암호화한 base64 값이다.
  name_enc         text not null,
  birth_date_enc   text not null,
  release_date_enc text not null,

  created_at timestamptz not null default now(),

  -- 보관 기간(§9.4)을 세는 기준. 마지막 접속일부터 1년이다.
  -- 날짜 단위로 두는 이유는 **하루 한 번만 갱신하기 위해서다.** 매 요청마다 쓰면
  -- 읽기만 하는 화면에서도 쓰기가 생긴다. 1년 기준에서 하루 오차는 의미가 없다.
  last_seen_on date not null default current_date,

  -- 사용자 요청 시 즉시 파기(§9.4). 실제 삭제 전 표시 단계로 둔다 —
  -- 삭제 작업이 실패해도 그 계정으로 다시 들어오지 못하게 한다.
  deleted_at timestamptz
);

comment on table app_user is
  '가입 정보. 이름·생일·출소날짜는 앱에서 암호화해 넣는다(§9.1 고민감 식별정보).';

create index if not exists app_user_last_seen_idx
  on app_user (last_seen_on)
  where deleted_at is null;

-- ── 죄목 ──
--
-- 별도 테이블인 이유가 둘이다(§9.1).
--   ① 동의를 철회했을 때 **그 항목만** 지울 수 있어야 한다
--   ② 관리자 앱을 포함한 대부분의 조회 경로에서 **이 테이블에 아예 접근하지 않게**
--      만들 수 있어야 한다. 담당자에게 죄목은 가지 않는다(§7.4)
create table if not exists user_crime (
  user_id uuid primary key references app_user (id) on delete cascade,

  -- 죄목 대분류. 개인화의 핵심 입력이라 외부 API로는 그대로 나가지만(§9.3),
  -- 그것이 정당한 것은 이름·생일·날짜가 마스킹된다는 전제에서다.
  category_enc text not null,

  -- 죄목은 별도 동의를 받는다. 동의 없이 이 행이 존재해서는 안 된다.
  consented_at timestamptz not null default now()
);

comment on table user_crime is
  '죄목. 민감정보 준용이라 별도 테이블로 떼어 둔다 — 동의 철회 시 이 행만 지우고, '
  '조회 경로 대부분이 이 테이블을 아예 보지 않게 하기 위해서다(§9.1·§7.4).';

-- ── 동의 이력 ──
--
-- 평문으로 둔다. 무엇에 동의했는지는 식별정보가 아니고, 분쟁이 생겼을 때
-- 그대로 읽혀야 하는 기록이다. 해당 정보를 파기할 때 함께 지운다(§9.4).
create table if not exists user_consent (
  id bigserial primary key,
  user_id uuid not null references app_user (id) on delete cascade,
  kind text not null,            -- privacy | crime_category | ...
  agreed boolean not null,
  at timestamptz not null default now()
);

create index if not exists user_consent_user_idx on user_consent (user_id, kind, at desc);

-- ── 세션 ──
--
-- **토큰 원문을 저장하지 않는다.** 해시만 둬서 DB가 유출돼도 세션을 탈취당하지
-- 않게 한다. 비밀번호를 평문으로 두지 않는 것과 같은 이유다.
create table if not exists user_session (
  token_hash text primary key,
  user_id uuid not null references app_user (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- last_seen_on과 같은 이유로 날짜 단위다.
  last_used_on date not null default current_date
);

create index if not exists user_session_user_idx on user_session (user_id);
create index if not exists user_session_expiry_idx on user_session (expires_at);

-- ── 접근 차단 ──
--
-- 네 테이블 모두 RLS를 켜고 **정책을 만들지 않는다.**
--
-- 정책이 없으면 anon·authenticated 역할은 아무것도 읽지 못한다. 백엔드는
-- service_role로 접근하므로 RLS를 우회한다. 즉 **클라이언트가 DB에 직접 닿는 길이
-- 없다** — 앱은 우리 API만 부른다.
--
-- 이렇게 하는 이유는 anon 키가 클라이언트 번들에 들어가는 공개 값이기 때문이다.
-- RLS가 꺼져 있으면 그 키를 가진 누구나 전체 테이블을 읽고 고칠 수 있다.
alter table app_user     enable row level security;
alter table user_crime   enable row level security;
alter table user_consent enable row level security;
alter table user_session enable row level security;
