-- AI 채팅 내역 — 기획서 §6.3
--
-- 저장하는 이유가 있다. 저장하지 않으면 다음에 앱을 켰을 때 어제 받은 안내가
-- 사라진다. 저리터러시 사용자가 같은 안내를 여러 번 다시 읽는다는 것을 전제하면,
-- 남지 않는 편이 더 나쁘다.
--
-- 다만 대화에는 사용자가 가장 사적으로 말한 내용이 들어 있다(§6.3-4). 그래서
--   ① 본문을 암호화한다
--   ② 대화별로 지울 수 있게 한다 — 경고로 막는 대신 지울 수 있게 하는 편이 낫다
--   ③ 보관 기간은 가입 정보와 같다(마지막 접속일 +1년)
--
-- **서버에 저장하는 것과 외부 API로 내보내는 것은 별개다.** 여기 저장되는 것은
-- 원문이고, LLM으로 나갈 때는 마스킹을 그대로 거친다(§9.3).

create table if not exists chat_message (
  id bigserial primary key,
  user_id uuid not null references app_user (id) on delete cascade,

  -- 어느 할 일의 대화인가. 할 일마다 방이 따로 생긴다(§6.1).
  -- 지원 항목에 매이지 않는 일반 대화는 빈 문자열로 둔다.
  route_id text not null default '',

  role text not null check (role in ('user', 'assistant')),

  -- 대화 본문. 앱에서 AES-256-GCM으로 암호화한 base64 값이다.
  content_enc text not null,

  created_at timestamptz not null default now()
);

comment on table chat_message is
  'AI 채팅 내역. 본문은 앱에서 암호화해 넣는다(§6.3). 대화별 삭제 경로가 있어야 한다.';

-- 방을 열 때마다 쓰는 조회다. 시간순으로 읽으므로 정렬까지 인덱스가 받아 준다.
create index if not exists chat_message_room_idx
  on chat_message (user_id, route_id, created_at);

alter table chat_message enable row level security;
