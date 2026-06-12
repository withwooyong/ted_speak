# ADR-0004: 데이터 계층 — Supabase 단독 (Prisma 보류) + RLS 보안 모델

- 날짜: 2026-06-12
- 상태: 승인
- 관련: PLAN.md §6.1 (ORM: Prisma), §8, docs/plans/p0-foundation.md T4

## 맥락

PLAN.md는 ORM으로 Prisma를 지정했다. 그러나 Prisma Client는 Node 서버 런타임 전용으로
**React Native에서 실행할 수 없고**, 백엔드는 "Supabase only"(D8/U9)라 Prisma가 돌 서버가 없다.

## 결정

1. **DB 스키마의 단일 출처는 `supabase/migrations/*.sql`** — Supabase CLI 마이그레이션으로 관리.
2. 앱은 `@supabase/supabase-js`로 직접 접근하며, 보안 경계는 **RLS가 전담**한다.
3. **Prisma는 도입하지 않는다.** Phase 3 Admin(Next.js, 서버 런타임)에서 필요해지면 재검토.
4. 로컬 개발은 `supabase start`(Docker, 포트 553xx — ted_duolingo와 충돌 회피) + `supabase db reset`.

## RLS 보안 모델

- 콘텐츠(courses/lessons): 모두 읽기 가능, 쓰기 정책 없음(service_role 전용)
- 사용자 데이터(profiles/lesson_sessions/conversation_turns/user_progress): `auth.uid()` 본인 행만
- conversation_turns 소유권은 lesson_sessions에 위임 (EXISTS 서브쿼리), **불변 로그**
  (update/delete 정책 없음 + lesson_sessions delete 차단으로 cascade 우회도 봉쇄)
- profiles INSERT는 `handle_new_user` 트리거 전용 (security definer, `set search_path = ''`)
- **컬럼 단위 grant 패턴**: RLS는 행 단위라 컬럼 보호가 안 되므로 `revoke` 후 화이트리스트만 grant
  - profiles update: display_name/level/goal/daily_goal_minutes만 —
    is_premium·premium_expires_at(과금), streak·total_speaking_seconds·last_study_date(통계) 차단
  - user_progress update: score만 — lesson_id(PK) 변경으로 슬롯을 비워 재삽입하면
    통계 트리거가 재발화되는 farming 우회 차단 (적대적 리뷰에서 발견)
- **통계는 서버 트리거가 전담**: `handle_progress_recorded` — user_progress INSERT 시
  total_speaking_seconds 누적 + streak 재계산. 날짜 경계는 KST 고정
  (타겟 한국 사용자 — 글로벌 확장 시 profiles.timezone 도입, P1 TODO)
- 검증: `scripts/verify-rls.mts` — 위조·열람·farming 공격 시나리오 33케이스 (로컬 스택 대상)

## 알려진 한계 (Phase 1+에서 해소)

- 최초 기록의 speaking_seconds 값 자체는 클라이언트 신뢰 (상한: 레슨당 3600초 CHECK).
  순위표 등 경쟁 요소 도입 전에 Edge Function 경유 측정으로 전환할 것.
- audio_url 저장 시 Storage 버킷 정책 별도 필요 (Phase 2 대화 히스토리에서 다룸).

## 부록 — 의존성 CVE 예외

- `uuid <11.1.1` (GHSA-w5hq-g745-h8pq, moderate 11건): Expo SDK 56 전이 의존성.
  수정 경로가 expo-splash-screen 55 다운그레이드(호환 파괴)뿐이고, 취약 경로(v3/v5/v6에
  `buf` 인자 전달)는 본 코드베이스에서 사용하지 않음 → **수용**. Expo SDK 업그레이드 시 재확인.
