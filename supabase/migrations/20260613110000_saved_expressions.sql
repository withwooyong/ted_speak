-- P2 W5: 저장된 표현(복습 노트) 스키마 + RLS (docs/plans/p2-w5-history.md)
-- 원칙: 사용자 소유 노트 — 통계·캡·보상에 연결하지 않는다(파밍 표면 0).
--   tutor_sessions(불변 로그·캡 표면)와 달리 delete를 허용한다 — 복습 목록 큐레이션이 자연스럽다.
--   단 insert는 화이트리스트 컬럼만(id·created_at 서버 default 위조 차단), update grant는 두지 않는다
--   (노트는 교정 스냅샷 — 불변. 편집 = 삭제 후 재저장).

create table public.saved_expressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 교정 전/후 (feedback-schema Correction 미러). 길이 상한은 스토리지 abuse 1차 방어
  -- (인증 사용자가 미세 변형으로 dedup을 우회해 대용량을 반복 저장하는 표면을 줄인다).
  original text not null check (char_length(original) between 1 and 500),
  suggested text not null check (char_length(suggested) between 1 and 500),
  -- Correction.type 미러
  type text not null check (type in ('grammar', 'vocab', 'pronunciation')),
  -- 교정이 나온 사용자 발화(복습 시 문맥) — 선택
  context text check (context is null or char_length(context) <= 1000),
  created_at timestamptz not null default now()
);

-- 목록 조회(본인·최신순)
create index saved_expressions_user_idx on public.saved_expressions (user_id, created_at desc);
-- 같은 표현 중복 저장 방지 — 저장은 idempotent(클라가 23505를 무시)
create unique index saved_expressions_dedup_idx
  on public.saved_expressions (user_id, original, suggested);

alter table public.saved_expressions enable row level security;

create policy "본인 저장 표현 조회" on public.saved_expressions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "본인 저장 표현 생성" on public.saved_expressions
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- delete 허용(의도): 저장 표현은 사용자 소유 노트 — 통계/캡 연결 없음(farming 무관).
create policy "본인 저장 표현 삭제" on public.saved_expressions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- update 정책 없음(의도): 노트는 불변 스냅샷 — 편집 비목표(삭제 후 재저장).

-- 컬럼 lockdown (tutor_sessions/user_progress 패턴) — id·created_at은 서버 default.
--   update grant는 두지 않는다(편집 비목표).
revoke insert, update on table public.saved_expressions from anon, authenticated;
grant insert (user_id, original, suggested, type, context)
  on table public.saved_expressions to authenticated;
