-- P1.5 V1: 온보딩 완료 마커 (docs/plans/p1-polish.md)
-- 가입 트리거가 기본값으로 행을 만들기 때문에 기존 컬럼으로는 온보딩 완료를 판별할 수 없다.
alter table public.profiles add column onboarded_at timestamptz;

-- 위조 영향 분석: 본인 행의 onboarded_at 조작 결과는 *본인* 온보딩 스킵뿐 — 통계·과금과 달리 무해.
-- 타인 행은 기존 RLS update 정책이 차단한다.
grant update (onboarded_at) on public.profiles to authenticated;
