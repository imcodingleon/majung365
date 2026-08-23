-- 담당자 채팅 — 기획서 §7.3
--
-- **방은 방문 요청 단위다.** 사용자와 지부를 영구히 묶지 않는다. 요청이 끝나면
-- 방도 닫힌다. 그래서 참고 프로젝트의 3테이블(chat_rooms·room_participants·
-- messages) 구조를 그대로 옮기지 않는다 — 방이 곧 visit_request이고 참여자는
-- 언제나 요청한 사람과 담당 기관 둘뿐이다.
--
-- **이미지를 넣지 않는다.** 참고 프로젝트에는 있지만 여기서는 신분증이나 서류
-- 사진을 주고받게 되어 위험만 커진다. 텍스트만 주고받는다.

create table if not exists visit_message (
  id uuid primary key default gen_random_uuid(),

  visit_id uuid not null references visit_request(id) on delete cascade,

  -- 누가 보냈나. 사람이 아니라 역할로 둔다 —
  -- 담당자가 교체되어도 지난 대화의 "누가 말했나"는 바뀌면 안 된다.
  sender_role text not null check (sender_role in ('user', 'staff')),

  -- 보낸 사람. 담당자 쪽만 채워진다(출소자는 방에 한 명뿐이라 visit_id로 정해진다).
  -- 계정이 지워져도 대화 기록은 남아야 하므로 set null이다.
  sender_staff_id uuid references staff_account(id) on delete set null,

  -- **본문은 암호화한다.** 사적인 사정이 오가고, 담당자 화면은 공용 기기일 수 있다.
  -- 키는 앱이 들고 있고 DB 안에 두지 않는다(§9.2).
  body_enc text not null,

  -- 낙관적 UI가 임시 말풍선과 서버 에코를 짝짓는 값(§7.3).
  -- 같은 방에서 같은 값이 두 번 오면 재전송이므로 무시한다.
  client_msg_id text,

  created_at timestamptz not null default now()
);

-- 방 하나의 대화를 시간순으로 읽는다.
create index if not exists visit_message_room_idx
  on visit_message (visit_id, created_at);

-- 재전송을 걸러낸다. client_msg_id가 없는 메시지는 이 제약을 받지 않는다.
create unique index if not exists visit_message_dedup_idx
  on visit_message (visit_id, client_msg_id)
  where client_msg_id is not null;

-- 읽음 표시. 참여자가 둘뿐이라 별도 테이블 대신 요청에 둔다.
alter table visit_request
  add column if not exists user_read_at timestamptz,
  add column if not exists staff_read_at timestamptz;

-- **RLS를 켜되 정책을 두지 않는다.** 정책이 없으면 anon 키로는 아무것도 읽지
-- 못하고 백엔드의 service_role만 닿는다. 대화 내용은 민감정보이므로 클라이언트가
-- DB에 직접 오는 길을 열지 않는다(§9.3).
alter table visit_message enable row level security;

-- 보관 기간은 방문 일정이 끝난 시점부터 3개월이다(§9.5). 파기 배치가 이 조건으로
-- 지운다 — visit_request.confirmed_at 또는 상태가 종료된 시점 기준이다.
-- 배치는 아직 없다. 있어야 이 주석이 약속이 된다.
