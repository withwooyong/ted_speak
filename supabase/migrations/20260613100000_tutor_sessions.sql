-- P2 W2: 프리토킹 세션 스키마 + RLS (docs/plans/p2-w2-pretalk.md, ADR-0008)
-- 원칙: lesson_sessions/conversation_turns 패턴을 그대로 미러 —
--   본인 행만 접근, 세션 삭제 불가(cascade 우회 방지), 턴은 불변 로그(insert만).
-- tutor duration_seconds는 profiles 통계(total_speaking_seconds)에 누적하지 않는다.
--   라이브 발화 시간은 서버가 검증하기 어려워(farming 표면) 통계 트리거를 두지 않는다. (ADR-0008)
--   주간 스피킹 리포트(W6)는 tutor_sessions를 클라이언트에서 집계한다.

-- ───────────────────────── tutor_sessions ─────────────────────────
create table public.tutor_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 프리토킹 주제 키(tutor-core.ts TUTOR_TOPICS의 id) — 콘텐츠 FK 없이 자유 텍스트
  topic text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'aborted')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- 1세션 발화가 1시간을 넘을 수 없다 — 부풀리기 1차 방어(user_progress.speaking_seconds 패턴)
  duration_seconds int not null default 0 check (duration_seconds between 0 and 3600),
  turn_count int not null default 0 check (turn_count >= 0),
  summary jsonb
);

create index tutor_sessions_user_idx on public.tutor_sessions (user_id, started_at desc);

alter table public.tutor_sessions enable row level security;

-- delete 정책 없음(의도): 세션 삭제를 허용하면 cascade로 턴(불변 로그)이 우회 삭제된다
create policy "본인 튜터 세션 조회" on public.tutor_sessions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "본인 튜터 세션 생성" on public.tutor_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "본인 튜터 세션 갱신" on public.tutor_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 컬럼 lockdown (user_progress 패턴) — duration_seconds·turn_count·started_at·status를
-- 클라이언트가 직접 위조하면 일일 캡(비용 통제, ADR-0007/0008)이 무력화된다.
--   · insert는 user_id·topic만 (나머지는 default — status='in_progress', started_at=now()).
--   · 완료(상태·발화시간·턴수 확정)는 아래 complete_tutor_session RPC로만 — 직접 update grant 없음.
revoke insert, update on table public.tutor_sessions from anon, authenticated;
grant insert (user_id, topic) on public.tutor_sessions to authenticated;

-- 세션 완료 — duration_seconds를 서버가 started_at 기준으로 산정한다(클라 보고 불신).
-- security definer + search_path='' (Supabase 권장). 본인·in_progress 세션만 완료 가능
-- (재완료·status 되돌리기 차단). duration은 [0,3600]으로 클램프(부풀리기/음수 방어).
create function public.complete_tutor_session(
  p_session_id uuid,
  p_turn_count int,
  p_summary jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tutor_sessions s
  set
    status = 'completed',
    ended_at = now(),
    turn_count = greatest(0, coalesce(p_turn_count, 0)),
    duration_seconds = least(3600, greatest(0, extract(epoch from (now() - s.started_at))::int)),
    summary = p_summary
  where s.id = p_session_id
    and s.user_id = (select auth.uid())   -- 본인 세션만 (definer가 RLS를 우회해도 방어)
    and s.status = 'in_progress';          -- 이미 완료/중단된 세션 재완료 차단
end;
$$;

revoke execute on function public.complete_tutor_session(uuid, int, jsonb) from anon;
grant execute on function public.complete_tutor_session(uuid, int, jsonb) to authenticated;

-- ───────────────────────── tutor_turns ─────────────────────────
create table public.tutor_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.tutor_sessions (id) on delete cascade,
  "order" int not null,
  role text not null check (role in ('user', 'assistant')),
  transcript text not null,
  corrections jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (session_id, "order")
);

alter table public.tutor_turns enable row level security;

-- 대화 턴은 불변 로그 — update/delete 정책 의도적 미허용 (학습 기록·피드백 신뢰성)
-- 세션 소유자만 접근 (소유권은 tutor_sessions로 위임)
create policy "본인 튜터 세션의 턴 조회" on public.tutor_turns
  for select to authenticated using (
    exists (
      select 1 from public.tutor_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

create policy "본인 튜터 세션에 턴 추가" on public.tutor_turns
  for insert to authenticated with check (
    exists (
      select 1 from public.tutor_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );
