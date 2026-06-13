# Session Handoff — Ted Speak (TalkTed)

> Last updated: 2026-06-13 (KST) · 세션 4
> Branch: `main` (origin: github.com/withwooyong/ted_speak, private)
> Latest commit: 세션 4 커밋 대기 (P1.5 다듬기) · 직전 `96335ab`

## Current Status

P1 핵심 루프(세션 3) 위에 **P1.5 다듬기**를 완료했다 — ADR-0005가 P2 과제로 남긴 두 한계
(재로그인 시 서버 상태 미반영, reply 길이 캡 부재)를 해소. 보안 민감 ted-run 풀 파이프라인
(TDD→구현→이중 리뷰→5관문→E2E) 통과. 코드 측은 P1 전부 + P1.5 완료, 남은 건 실기기 검증
(사용자 액션)과 U11 OAuth(준비 문서 작성 완료, 전제 충족 후 착수)뿐이다.

## Completed This Session

| # | Task | Files |
|---|------|-------|
| 1 | V1 재로그인 하이드레이트 — `onboarded_at` 마커 + profile-sync 재조회, 방어 검증·권위 출처 구분 | supabase/migrations/20260613000000_*.sql, apps/mobile/src/lib/profile-sync.ts(신규), stores/{user,user-core}.ts |
| 2 | V1 라우팅 — index.tsx hydrating 게이트, login.tsx imperative→반응형 effect(스테일 onboarded 우회 해소) | apps/mobile/src/app/{index,login,onboarding,_layout}.tsx |
| 3 | V2 reply clamp — `clampReply`/`MAX_REPLY_CHARS=400`, getTurnFeedback 적용 | packages/shared/src/feedback-schema.ts, packages/ai/src/tutor.ts |
| 4 | 보안 — in-flight 크로스유저 PII 주입 차단(스테일 가드), 리스너 로그아웃 PII 정리(재수화 가드), LEARNING_GOALS 단일 출처 | profile-sync.ts, stores/user.ts, packages/shared/src/{content-schema,types}.ts |
| 5 | RLS — onboarded_at grant + 검증 케이스 3 추가(본인 허용/타인 차단/비-grant 거부) | scripts/verify-rls.mts |
| 6 | E2E — supabase-flow S12(재로그인 온보딩 스킵·onboarded_at DB 반영·PII 정리) | e2e/supabase-flow.spec.mjs |
| 7 | ADR-0006 + ADR-0005 한계 2건 해소 포인터 | docs/adr/ADR-0006-profile-hydration.md(신규), ADR-0005 |
| 8 | 문서 — 실기기 검증 체크리스트, U11 OAuth 준비, Phase 2 계획서 초안, P1.5 계획서 | docs/checklists/p1-device-verification.md, docs/plans/{u11-oauth-prep,p2-tutor,p1-polish}.md |

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | 실기기 검증 (P1 완료 정의 ①②③) | 🔴 사용자 액션 | Xcode 미설치 → Expo Go로. **체크리스트: `docs/checklists/p1-device-verification.md`**(레슨 11 + 폴백 4 + 양 모드 로그인). 턴 지연 중앙값 측정 → ADR-0003 갱신 |
| 2 | U11 Google/Apple OAuth | ⬜ 준비 완료 | **설계·준비 문서: `docs/plans/u11-oauth-prep.md`**. 네이티브 ID 토큰 방식 확정. 착수 전제: Apple Developer(구매 예정)·번들 ID·호스팅 Supabase·EAS dev build |
| 3 | 호스팅 Supabase 연결 | 🔴 사용자 액션 | 프로젝트 생성 → `supabase link` + `db push`(마이그레이션 3건) → EAS env |
| 4 | Phase 2 (AI 튜터·발음) | ⬜ 계획 초안 | **`docs/plans/p2-tutor.md`** — W1 Realtime POC부터. 착수 전 우선순위 재확인 |
| 5 | 출시 전 Edge Function 프록시 | ⬜ P2 W7 | dev는 EXPO_PUBLIC_OPENAI_API_KEY, prod는 음성 비활성(ADR-0005 §6) |

## Key Decisions Made

- **ADR-0006**: 재로그인 하이드레이트 — `onboarded_at` 마커(grant 무해 분석), profile-sync 구독,
  스테일 응답 폐기(in-flight 사용자 전환 PII 차단), anti-flash(hydrating 동안 라우팅 대기),
  리스너 로그아웃 PII 정리. reply clamp는 회복형 절단(하드 실패 아님)
- **login.tsx 라우팅 단일 출처화**: imperative `routeAfterAuth`(스테일 onboarded·onAuthStateChange
  타이밍 결함)를 status·hydrating·onboarded 반응형 effect로 교체 — E2E S12b가 잡은 결함
- **LEARNING_GOALS 단일 출처**: content-schema.ts에 런타임 상수, types.ts는 타입 파생(coverage
  exclude 전제 유지). VALID_GOALS가 이를 사용 — 수동 동기화 drift 제거

## Known Issues

- 동일 사용자 fetch 수명 내 재로그인 + 구 fetch 실패 시 hydrating 조기 해제(온보딩 flash, 데이터
  손상 없음) — 세대 토큰 도입 P2 W7 (ADR-0006 한계)
- 오프라인 콜드 스타트 INITIAL_SESSION(null) 시 로컬 카운터 와이프(가용성 LOW) — 필드 서버 승격 시 해소
- e2e mock-flow S10(supabase 폼 셀렉터) 실패 — 기존 known issue, supabase-flow S10은 PASS
- uuid <11.1.1 CVE(moderate 11건, Expo 전이) — 수용 예외 유지, ADR-0004 부록
- 웹 user 스토어·mock progress는 메모리 폴백 — 새로고침 시 소실, 네이티브는 영속
- recordProgress 비-23505 실패 시 streak 칩 미갱신 — 의도된 보수적 동작

## Context for Next Session

- **사용자 목표**: PLAN.md(v0.3) 기반 Speak 스타일 AI 영어 스피킹 앱. 품질 우선(D10), `/ted-run` 파이프라인, 프로토타입(prototype/index.html)이 UX 스펙
- **다음 작업 후보**: ① 실기기 검증(체크리스트 따라) → 지연 측정 ADR-0003 반영 ② U11 OAuth 전제 충족 후 착수(준비 문서 §4 Definition of Ready) ③ Phase 2 W1 Realtime POC(독립 착수 가능)
- **로컬 개발**: `supabase start`(553xx) → `supabase db reset`(마이그레이션 **3건**+시드 6레슨) → `npx tsx scripts/verify-rls.mts`(**36케이스**). 앱: `npm run mobile`, AI는 .env에 EXPO_PUBLIC_OPENAI_API_KEY(dev 전용)
- **E2E**: `e2e/*.spec.mjs` — expo web(:8082)+Playwright. 스크린샷·results는 gitignore
- **제약·선호**: 커밋 한글, **푸시는 명시 요청 시에만**, StyleSheet+토큰만(인라인 hex 금지), zod z.infer 단일 출처, 새 컬럼은 grant 화이트리스트 검토, 스키마 변경은 보안 민감 ted-run
- **테스트 인프라**: vitest 272개·커버리지 93.4/86.1/96.5%(게이트 80). 신규 순수 모듈은 vitest.config.ts coverage.include에 등록 필요. `@ted-speak/shared` alias 제거 금지
