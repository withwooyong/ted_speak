-- P0 T4: 초기 스키마 + RLS (PLAN.md §8)
-- 원칙: 콘텐츠(courses/lessons)는 public read·서버만 쓰기,
--       사용자 데이터(profiles/sessions/turns/progress)는 본인 행만 접근.

-- ───────────────────────── profiles ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- CEFR 레벨 변경 시 packages/shared/src/content-schema.ts의 CEFR_LEVELS와 동시 수정 필수
  level text not null default 'A2' check (level in ('A1', 'A2', 'B1', 'B2')),
  goal text not null default 'daily' check (goal in ('daily', 'business', 'travel')),
  daily_goal_minutes int not null default 10 check (daily_goal_minutes between 1 and 120),
  streak int not null default 0 check (streak >= 0),
  total_speaking_seconds int not null default 0 check (total_speaking_seconds >= 0),
  is_premium boolean not null default false,
  premium_expires_at timestamptz,
  last_study_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "본인 프로필 조회" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "본인 프로필 수정" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- 민감 필드는 클라이언트 수정 불가 (RLS는 행 단위라 컬럼은 grant로 제한)
--   is_premium/premium_expires_at: service_role(결제 웹훅, Phase 3)만 변경
--   streak/total_speaking_seconds/last_study_date: user_progress insert 트리거만 갱신 (위조 방지)
revoke insert, update on table public.profiles from anon, authenticated;
grant update (display_name, level, goal, daily_goal_minutes)
  on public.profiles to authenticated;

-- insert는 트리거로만 (클라이언트 직접 insert 금지 — is_premium 위조 방지)
-- security definer + search_path='' (Supabase 권장): 함수 본문은 반드시 스키마를 명시할 것
-- (profiles insert가 authenticated 권한이 아닌 definer 권한으로 동작하는 데 의존한다)
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── courses / lessons (콘텐츠) ─────────────────────────
create table public.courses (
  id text primary key,
  title text not null,
  level text not null check (level in ('A1', 'A2', 'B1', 'B2')),
  "order" int not null,
  description text not null default ''
);

create table public.lessons (
  id text primary key,
  course_id text not null references public.courses (id) on delete cascade,
  "order" int not null,
  title text not null,
  title_en text not null default '',
  estimated_minutes int not null default 5,
  key_phrases jsonb not null default '[]',
  drills jsonb not null default '[]',
  conversation jsonb not null default '{}'
);

create index lessons_course_id_idx on public.lessons (course_id, "order");

alter table public.courses enable row level security;
alter table public.lessons enable row level security;

-- 콘텐츠는 누구나 읽기 (쓰기 정책 없음 → service_role 전용)
create policy "코스 공개 조회" on public.courses for select to anon, authenticated using (true);
create policy "레슨 공개 조회" on public.lessons for select to anon, authenticated using (true);

-- ───────────────────────── lesson_sessions ─────────────────────────
create table public.lesson_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id text not null references public.lessons (id) on delete cascade,
  current_step int not null default 1 check (current_step between 1 and 3),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  feedback_summary jsonb
);

create index lesson_sessions_user_idx on public.lesson_sessions (user_id, started_at desc);
create index lesson_sessions_lesson_id_idx on public.lesson_sessions (lesson_id);

alter table public.lesson_sessions enable row level security;

-- delete 정책 없음(의도): 세션 삭제를 허용하면 cascade로 대화 턴(불변 로그)이 우회 삭제된다
create policy "본인 세션 조회" on public.lesson_sessions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "본인 세션 생성" on public.lesson_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "본인 세션 갱신" on public.lesson_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ───────────────────────── conversation_turns ─────────────────────────
create table public.conversation_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lesson_sessions (id) on delete cascade,
  "order" int not null,
  role text not null check (role in ('user', 'assistant')),
  transcript text not null,
  audio_url text,
  corrections jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (session_id, "order")
);

alter table public.conversation_turns enable row level security;

-- 대화 턴은 불변 로그 — update/delete 정책 의도적 미허용 (학습 기록·피드백 신뢰성)
-- 세션 소유자만 접근 (소유권은 lesson_sessions로 위임)
create policy "본인 세션의 턴 조회" on public.conversation_turns
  for select to authenticated using (
    exists (
      select 1 from public.lesson_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

create policy "본인 세션에 턴 추가" on public.conversation_turns
  for insert to authenticated with check (
    exists (
      select 1 from public.lesson_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

-- ───────────────────────── user_progress ─────────────────────────
create table public.user_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id text not null references public.lessons (id) on delete cascade,
  completed_at timestamptz not null default now(),
  -- 레슨 1회 발화가 1시간을 넘을 수 없다 — 발화 시간 부풀리기 1차 방어
  speaking_seconds int not null default 0 check (speaking_seconds between 0 and 3600),
  score int check (score between 0 and 100),
  primary key (user_id, lesson_id)
);

create index user_progress_lesson_id_idx on public.user_progress (lesson_id);

alter table public.user_progress enable row level security;

-- delete 정책 없음(의도): 삭제→재삽입으로 streak/발화시간 트리거를 재발화시키는 farming 차단
create policy "본인 진행도 조회" on public.user_progress
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "본인 진행도 기록" on public.user_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "본인 진행도 갱신" on public.user_progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- update는 score만 허용 — lesson_id(PK) 변경으로 슬롯을 비우고 재삽입해
-- 통계 트리거를 재발화시키는 farming 우회 차단. speaking_seconds도 불변(집계 비동기화 방지)
revoke insert, update on table public.user_progress from anon, authenticated;
grant insert (user_id, lesson_id, speaking_seconds, score) on public.user_progress to authenticated;
grant update (score) on public.user_progress to authenticated;

-- ───────────────────────── 통계 누적 트리거 ─────────────────────────
-- streak·total_speaking_seconds는 클라이언트 직접 update 불가(컬럼 grant 제외).
-- 최초 완료(insert) 시에만 서버가 누적한다 — update는 누적을 재발화하지 않음.
create function public.handle_progress_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- streak 날짜 경계는 KST 기준 (타겟 사용자 한국 — UTC면 아침 학습이 전날로 집계됨)
  -- TODO(P1 글로벌): profiles.timezone 컬럼 도입 시 사용자별 기준으로 전환
  kst_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  update public.profiles p
  set
    total_speaking_seconds = p.total_speaking_seconds + new.speaking_seconds,
    streak = case
      when p.last_study_date = kst_today then p.streak
      when p.last_study_date = kst_today - 1 then p.streak + 1
      else 1
    end,
    last_study_date = kst_today,
    updated_at = now()
  where p.id = new.user_id;
  return new;
end;
$$;

create trigger on_progress_recorded
  after insert on public.user_progress
  for each row execute function public.handle_progress_recorded();
