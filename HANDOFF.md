# Session Handoff — Ted Speak (TalkTed)

> Last updated: 2026-06-12 17:28 (KST) · 세션 2
> Branch: `main` (origin: github.com/withwooyong/ted_speak, private)
> Latest commit: `6cc31f1` - T2 완결 + T4 Supabase: 스키마·RLS·Dev Mock Auth

## Current Status

Phase 0(Foundation)이 사실상 완료됐다 — T3 기기 검증과 호스팅 Supabase 연결(둘 다 사용자 액션)만 남았다.
다음 작업은 `/ted-run docs/plans/p1-core-loop.md`로 Phase 1(MVP 핵심 루프) 착수.

## Completed This Session

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | T2 완결 — 짧은 발화 벤치마크, 체감 지연 중앙값 3.51s ≤4s 확인, gpt-4o-mini 기각 | `6cc31f1` | packages/ai/spike/bench.mts, src/stt.ts(model 옵션), docs/adr/ADR-0003 |
| 2 | T4 — 로컬 Supabase 스키마+RLS+시드 (Docker, 포트 553xx) | `6cc31f1` | supabase/migrations/20260612000000_init.sql, seed.sql, config.toml |
| 3 | T4 — 앱 인증: supabase-js 클라이언트, Dev Mock Auth, 프로덕션 env 가드, 세션 리스너 | `6cc31f1` | apps/mobile/src/lib/{supabase,auth-config}.ts, src/stores/{auth,auth-core}.ts, test/* |
| 4 | 보안 게이트 — 이중 리뷰(2a sonnet + 2b opus 적대적) 교차 검증, RLS 공격 33케이스 | `6cc31f1` | scripts/verify-rls.mts |
| 5 | ADR-0004(데이터 계층) + P1 작업계획서 작성 | `6cc31f1` | docs/adr/ADR-0004-data-layer.md, docs/plans/p1-core-loop.md |

(세션 1: `aab4a3b`~`72fd933` — 프로토타입·스파이크·모노레포·T1/T5/T6/T7·GitHub 푸시. CHANGELOG 참조)

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Phase 1 착수 (U1: ai 타임아웃·재시도부터) | ⬜ 준비 완료 | `/ted-run docs/plans/p1-core-loop.md` |
| 2 | T3 오디오 POC 기기 검증 | 🔴 사용자 액션 | 이 머신은 Xcode 미설치(CommandLineTools만) → 시뮬레이터 불가. Xcode 설치 또는 실기기 Expo Go에서 `/dev/audio-poc` 녹음→재생 확인 |
| 3 | 호스팅 Supabase 연결 | 🔴 사용자 액션 | 프로젝트 생성 → `supabase link` + `db push` → EAS env 설정 |

## Key Decisions Made

- **ADR-0004**: Prisma 미도입 (RN에서 실행 불가, 백엔드 Supabase only) — 스키마 단일 출처는 `supabase/migrations/*.sql`, 보안 경계는 RLS 전담
- **컬럼 grant 화이트리스트 패턴**: RLS는 행 단위라 컬럼 보호 불가 → profiles는 display_name/level/goal/daily_goal_minutes만, user_progress는 score만 update 허용. 과금(is_premium)·통계(streak/발화시간) 클라이언트 위조 차단
- **통계는 서버 트리거 전담**: `handle_progress_recorded` (user_progress INSERT 시 누적, KST 날짜 경계). 적대적 리뷰가 잡은 PK 셔플 farming(update로 lesson_id 변경→재삽입→트리거 재발화)까지 봉쇄
- **ADR-0003 갱신**: 모델 조합 실측 — 현행(whisper-1+gpt-4o+tts-1 스트리밍) 유지, gpt-4o-mini는 JSON 생성이 더 느림(중앙값 7s, 최대 16s)
- **conversation_turns는 불변 로그**: update/delete 정책 없음 + 세션 delete 차단(cascade 우회 봉쇄)
- **프로덕션 mock 방지**: env 누락 시 dev는 Mock Auth 폴백, prod 빌드는 의도적 throw (`resolveAuthMode` isProd 가드 — `expo export`도 prod로 취급됨에 주의)

## Known Issues

- `uuid <11.1.1` CVE(moderate 11건, Expo SDK 56 전이 의존성) — 수용 예외, ADR-0004 부록 (SDK 업그레이드 시 재확인)
- 최초 기록의 speaking_seconds 값은 클라이언트 신뢰(레슨당 3600초 CHECK만) — 순위표 도입 전 Edge Function 전환 (ADR-0004 알려진 한계)
- streak 날짜 경계 KST 고정 — 글로벌 확장 시 profiles.timezone 필요 (P1 TODO 주석)
- OpenAI API undici keep-alive 스톨 실측 2회 — ai 클라이언트 타임아웃·재시도 미구현, **P1 U1이 최우선인 이유**
- `signInMock`은 스토어 레벨 mode 가드 없음 — P1 U8에서 UI 게이트로 처리 (mock 사용자는 서버 권한 없어 피해 없음, 2b 리뷰 LOW)

## Context for Next Session

- **사용자 목표**: PLAN.md(v0.3) 기반 Speak 스타일 AI 영어 스피킹 앱 전체 구축. 품질 우선(D10), `/ted-run` 파이프라인 준수, HTML 프로토타입(`prototype/index.html`)이 UX 스펙
- **다음 작업**: `/ted-run docs/plans/p1-core-loop.md` — 권장 순서 U1(ai 신뢰성) → U2(녹음→STT) → U4~U7(레슨 3단계+진행 저장) → U3/U8(온보딩·로그인) → U9(콘텐츠) → U10(E2E)
- **로컬 Supabase**: `supabase start`(553xx — ted_duolingo 543xx와 충돌 회피) → `supabase db reset` → `npx tsx scripts/verify-rls.mts`. 앱 연결은 `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321` + anon key(start 출력)
- **제약·선호**: 커밋 메시지 한글, **푸시는 명시 요청 시에만**(개인 repo 커밋 이메일 gmail — repo-local 설정됨), 스타일은 StyleSheet+토큰만(ADR-0001, 인라인 hex 금지), 타입은 zod 스키마에서 z.infer 파생(중복 정의 금지), 새 컬럼 추가 시 grant 화이트리스트 검토 필수
- **테스트 인프라**: vitest 45개·커버리지 99/92/100% (게이트 80%), `@ted-speak/shared` alias 제거 금지(워크스페이스 심링크 커버리지 병합 버그), OPENAI_API_KEY는 레포에 없음(.env.example 참조)
- T4 추가 작업(스키마 변경 등)은 **보안 민감 분류**로 ted-run (2b 적대적 리뷰 + 3-4 보안 스캔 필수)

## Files Modified This Session

```
23 files changed, 1574 insertions(+), 33 deletions(-)  (6cc31f1)
supabase/{migrations/20260612000000_init.sql, seed.sql, config.toml, .gitignore}
apps/mobile/src/{lib/{supabase,auth-config}.ts, stores/{auth,auth-core}.ts, app/_layout.tsx}
apps/mobile/test/{auth-config,auth-store}.test.ts
packages/ai/{spike/bench.mts, src/stt.ts}
scripts/verify-rls.mts
docs/{adr/ADR-0003,adr/ADR-0004,plans/p1-core-loop}.md
.env.example, vitest.config.ts, CHANGELOG.md, HANDOFF.md
```
