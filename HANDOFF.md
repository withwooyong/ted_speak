# Session Handoff — Ted Speak (TalkTed)

> Last updated: 2026-06-13 (KST) · 세션 3
> Branch: `main` (origin: github.com/withwooyong/ted_speak, private)
> Latest commit: `6489099` - P1 핵심 루프: 레슨 3단계 음성 루프·온보딩·로그인·진행 저장

## Current Status

Phase 1(MVP 핵심 루프)의 **코드 측 구현이 완료**됐다 — U1~U9 전부, U10은 웹 E2E까지.
남은 것은 실기기 검증(사용자 액션)과 U11 OAuth(보류 — 협의 필요)뿐이다.
보안 민감 ted-run 풀 파이프라인(TDD→구현→이중 리뷰→5관문→E2E) 통과.

## Completed This Session

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | U1 AI 신뢰성 — reliableFetch(타임아웃 15s·백오프 재시도 2회·signal 취소·스트림 첫바이트 전만 재시도) | `6489099` | packages/ai/src/reliability.ts, stt/tts/tutor.ts |
| 2 | U2/U4 — recorder-core+useRecorder(30초 cap·권한 폴백), tts-cache 사전 합성 파일 캐시 | `6489099` | apps/mobile/src/{lib,hooks}/* |
| 3 | U5/U6/U7 — lesson-core 상태 머신, Drill 로컬 채점, 4턴 대화+문장 분할 TTS, 진행 저장·이어하기 | `6489099` | lib/lesson-core.ts, progress-repo.ts, app/lesson/[id].tsx, components/lesson/* |
| 4 | U3/U8 — 온보딩 4단계(프로토타입 동선), 이메일 로그인/가입+Dev Mock 게이트 | `6489099` | app/{onboarding,login,index}.tsx, (tabs)/{home,profile}.tsx |
| 5 | U9 — 일상 회화 6레슨, seed.sql 생성기(`npm run generate:seed`) | `6489099` | content/, packages/shared/src/seed-sql.ts, scripts/generate-seed.mts |
| 6 | 스키마 — lesson_sessions.snapshot 컬럼(이어하기) 마이그레이션 | `6489099` | supabase/migrations/20260612090000_*.sql |
| 7 | 보안 게이트 — 이중 리뷰(MEDIUM 4·LOW 5 수정+재리뷰 PASS), semgrep 0건, RLS 33/33 | `6489099` | stores/auth.ts(로그아웃 PII 정리), lib/ai.ts(dev 키 가드) |
| 8 | E2E — 웹 Playwright 35 PASS (mock 풀루프 + supabase 가입→온보딩→profiles DB 반영) | `6489099` | e2e/*.spec.mjs |
| 9 | ADR-0003 갱신(신뢰성·문장 분할 재생) + ADR-0005 신규(진행 영속화·신뢰 경계) | `6489099` | docs/adr/ |

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | 실기기 검증 (P1 완료 정의 ①②③) | 🔴 사용자 액션 | Xcode 미설치 → 실기기 Expo Go로: 레슨 3단계 음성 완주, 턴 체감 지연 중앙값 ≤4s 측정, 30초 cap·권한 거부 폴백. 체크리스트는 세션 로그 참조(레슨 11항목 + 온보딩/로그인 양 모드) |
| 2 | U11 Google/Apple OAuth | ⬜ 보류 | 개발자 계정·번들 ID 필요 — 사용자와 협의 후 착수 |
| 3 | 호스팅 Supabase 연결 | 🔴 사용자 액션 | 프로젝트 생성 → `supabase link` + `db push`(마이그레이션 2건) → EAS env |
| 4 | 출시 전 Edge Function 프록시 | ⬜ P2~ | dev는 EXPO_PUBLIC_OPENAI_API_KEY, prod는 음성 비활성(ADR-0005 §6) |

## Key Decisions Made

- **ADR-0005**: 이어하기는 lesson_sessions.snapshot(text, opaque) + fromSnapshot 방어적 폴백. 완료는 completeSession→recordProgress→applyReward 순서 보장, complete 스냅샷 미저장+23505 멱등으로 이중 보상 차단. 대화 복원은 conversation_turns 재조회(getTurns)
- **ADR-0003 갱신**: reliableFetch가 전 AI 호출 표준 경로. Ted 발화는 문장 단위 분할 합성 확정(RN MediaSource 부재 — synthesizeStream 직접 재생은 네이티브 buffer queue 도입 시 재평가)
- **로그아웃 PII 정리**(2b 지적): user 스토어 reset+persist 삭제, mock progress 저장소 user id 네임스페이스. repo 캐시는 progress.ts의 auth 구독으로 정리(require cycle 방지)
- **AI 키 dev 전용**: getAiConfig()가 !__DEV__에서 null — prod 번들에 키가 인라인돼도 미사용
- **seed.sql 단일 출처화**: content JSON → `npm run generate:seed` (수동 동기화 제거, P0 TODO 해소)

## Known Issues

- uuid <11.1.1 CVE(moderate 11건, Expo 빌드 도구 전이) — 수용 예외 유지, ADR-0004 부록
- tts-cache 키 32bit FNV-1a — 시드 규모에선 충돌 무시 가능, 커뮤니티 콘텐츠 도입 시 확장 (2b LOW)
- TurnFeedback reply 길이 캡은 max_tokens(220)만 — 스키마 .max() 보류 (2b LOW)
- recordProgress 비-23505 실패 시 streak 칩 미갱신·재플레이 가능 — 의도된 보수적 동작(재리뷰 판정)
- 웹의 user 스토어·mock progress는 메모리 폴백(AsyncStorage 웹 SSR 이슈) — 새로고침 시 소실, 네이티브는 영속

## Context for Next Session

- **사용자 목표**: PLAN.md(v0.3) 기반 Speak 스타일 AI 영어 스피킹 앱. 품질 우선(D10), `/ted-run` 파이프라인, 프로토타입(prototype/index.html)이 UX 스펙
- **다음 작업 후보**: ① 실기기 검증 결과 반영(지연 측정→ADR-0003 기준 갱신) ② U11 OAuth 협의 ③ P1 잔여 다듬기(supabase 모드 profiles 재조회 동기화, reply 길이 캡) ④ Phase 2 계획서
- **로컬 개발**: `supabase start`(553xx) → `supabase db reset`(마이그레이션 2건+시드 6레슨) → `npx tsx scripts/verify-rls.mts`(33케이스). 앱: `npm run mobile`, AI는 .env에 EXPO_PUBLIC_OPENAI_API_KEY(dev 전용)
- **E2E**: `e2e/*.spec.mjs` — expo web(:8082)+Playwright. 스크린샷·results는 gitignore
- **제약·선호**: 커밋 한글, **푸시는 명시 요청 시에만**, StyleSheet+토큰만(인라인 hex 금지), zod z.infer 단일 출처, 새 컬럼은 grant 화이트리스트 검토, 스키마 변경은 보안 민감 ted-run
- **테스트 인프라**: vitest 228개·커버리지 96.1/84.8/96.4%(게이트 80). 신규 순수 모듈은 vitest.config.ts coverage.include에 등록 필요. `@ted-speak/shared` alias 제거 금지

## Files Modified This Session

```
55 files changed, 8304 insertions(+), 139 deletions(-)  (6489099)
packages/ai/{src/reliability.ts(신규), src/{stt,tts,tutor}.ts, index.ts, test/*}
packages/shared/{src/seed-sql.ts(신규), src/tokens.ts, index.ts, test/*}
apps/mobile/src/lib/{lesson-core,progress-repo,progress,recorder-core,tts-cache,tts,ai,login-core}.ts(신규)
apps/mobile/src/hooks/{use-recorder,use-tts}.ts(신규), src/stores/{user,user-core,auth}.ts
apps/mobile/src/app/{login.tsx(신규), onboarding,index, (tabs)/{home,profile,tutor}, lesson/[id]}.tsx
apps/mobile/src/components/lesson/*(신규 5), test/*(신규 6)
content/courses/daily-conversation.json(6레슨), scripts/generate-seed.mts(신규)
supabase/{migrations/20260612090000_lesson_session_snapshot.sql(신규), seed.sql(재생성)}
docs/adr/{ADR-0003(갱신), ADR-0005(신규)}, e2e/*.spec.mjs(신규), vitest.config.ts, package.json
```
