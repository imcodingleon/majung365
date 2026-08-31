-- 담당자가 먼저 읽는 요약 — 기획서 §7.4
--
-- 동의해 보낸 진단 답변은 스무 줄까지 온다. 담당자는 그것을 위에서부터 훑으면서
-- **지금 이 사람에게 무엇이 급한지를 스스로 읽어 내야 했다.** 그 첫 번째 읽기를
-- 모델이 대신하고, 원문은 버튼을 눌러 그대로 펼쳐 볼 수 있게 한다.
--
-- **요약은 원문을 대체하지 않는다.** 생성에 실패해도 담당자는 답변을 그대로 본다.
-- 그래서 상태를 따로 두고, 화면이 그 상태에 따라 무엇을 그릴지 정한다.
--
-- 0006과 같은 전제를 따른다 — **요약도 그 방문 요청 한 건에만 붙는다.** 사용자
-- 프로필로 쌓아 두면 상시 보관하지 않기로 한 판단이 뒤집힌다. 요청이 파기될 때
-- 요약도 함께 사라진다(§9.5).

alter table visit_request
  -- 모델이 만든 요약문. **자유 문장이므로 암호화한다** — 답변 원문과 같은 취급이다.
  add column if not exists summary_enc text,

  -- none: 동의한 답변이 없어 만들 것이 없다
  -- pending: 만드는 중이다. 담당자 화면은 이때 원문을 펼쳐 둔다
  -- ready: 요약이 있다
  -- failed: 만들지 못했다. 담당자 화면은 원문만 그린다
  add column if not exists summary_status text not null default 'none',

  -- 언제 만들었는가. 답변을 보낸 시각과 다를 수 있다.
  add column if not exists summary_at timestamptz;

do $$
begin
  alter table visit_request
    add constraint visit_request_summary_status_check
    check (summary_status in ('none', 'pending', 'ready', 'failed'));
exception
  when duplicate_object then null;
end $$;
