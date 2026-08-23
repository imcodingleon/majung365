-- 방문 요청 — 기획서 §7
--
-- 목적은 시간을 잡아 주는 것이 아니라 **만날 사람이 정해진 상태로 방문하게 하는
-- 것**이다. "창구에서 신분이 드러나는 순간이 실질적 장벽"이라는 인터뷰 결과의
-- 해법이 여기에 있다. 그래서 assigned_staff_id와 meeting_place는 확정에 함께
-- 채워지며, 하나만 있으면 이 기능이 성립하지 않는다.

create table if not exists visit_request (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references app_user(id) on delete cascade,

  -- 어느 지원 항목인가(R1~R15). 이 값이 담당 기관을 정한다.
  route_id text not null,

  -- 받을 기관. 항목에서 도출되지만 컬럼으로 굳혀 둔다 —
  -- 담당자 목록 조회가 이 값 하나로 끝나야 하고, 나중에 항목·기관 매핑이 바뀌어도
  -- 이미 보낸 요청이 다른 기관 목록으로 옮겨 가면 안 된다.
  org_kind text not null check (org_kind in ('koreha', 'center')),

  -- 상태 여섯. 전이 규칙은 코드(domain/entity.py의 _NEXT)가 들고 있고,
  -- 여기서는 값의 범위만 막는다.
  status text not null default 'sent' check (
    status in (
      'sent',                 -- 담당자에게 전달했어요
      'acknowledged',         -- 담당자가 확인했어요 — 여기서부터 채팅이 열린다
      'confirmed',            -- 시간·장소·담당자가 정해졌어요
      'reschedule_proposed',  -- 담당자가 다른 시간을 제안했어요
      'completed',            -- 방문 완료
      'cancelled'
    )
  ),

  -- 희망 시간. 2지망이 있으면 조율 왕복이 한 번 줄어든다(§7.2).
  preferred_at_1 timestamptz not null,
  preferred_at_2 timestamptz,

  -- 미리 챙긴 서류. 담당자가 알면 헛걸음을 막는다.
  prepared_docs text[] not null default '{}',

  -- **자유 입력이라 암호화한다.** 사적인 사정이 담기고, 담당자 화면은 공용 기기일
  -- 수 있다. 키는 앱이 들고 있고 DB 안에 두지 않는다(§9.2).
  note_enc text,

  -- ── 확정 정보 ──
  -- 담당자 계정이 지워져도 요청 기록은 남아야 하므로 set null이다.
  assigned_staff_id uuid references staff_account(id) on delete set null,
  confirmed_at timestamptz,
  meeting_place text,

  -- 담당자가 다른 시간을 제안했을 때의 그 시간.
  proposed_at timestamptz,
  cancel_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 상한 판정(§7.5)이 사용자별 요청을 통째로 읽는다.
create index if not exists visit_request_user_idx
  on visit_request (user_id, status, created_at desc);

-- 담당자 목록은 기관과 상태로 좁힌다.
create index if not exists visit_request_org_idx
  on visit_request (org_kind, status, created_at desc);

-- **RLS를 켜되 정책을 두지 않는다.** 정책이 없으면 anon 키로는 아무것도 읽지
-- 못하고, 백엔드의 service_role만 닿는다. 클라이언트가 DB에 직접 오는 길을 막는
-- 것이 이 서비스의 기본 자세다.
alter table visit_request enable row level security;
