# Session Handoff — Ted Speak (TalkTed)

> Last updated: 2026-06-13 (KST) · 세션 5
> Branch: `main` (origin: github.com/withwooyong/ted_speak, private)
> Latest commit: `3f90b77` - P1.5 다듬기 (푸시 완료) · **미커밋: W1 Realtime 스파이크 + 실측·ADR-0007 승인**

## Current Status

세션 4에서 P1.5 다듬기(커밋·푸시 `3f90b77`)와 W1 Realtime 스파이크(미커밋)를 작성했고,
**세션 5에서 W1 실측을 완료**했다.

1. **P1.5 다듬기**(커밋·푸시 완료, `3f90b77`) — ADR-0005가 P2 과제로 남긴 두 한계(재로그인 시
   서버 상태 미반영, reply 길이 캡 부재)를 보안 민감 ted-run 풀 파이프라인으로 해소.
2. **Phase 2 W1 Realtime 실측 완료**(미커밋) — gpt-realtime GA 실측: 첫 응답 **0.63s**, barge-in
   **175ms**, 턴당 ~$0.006–0.010. 실측 중 스파이크 버그 3건 수정(session.update 미전송·GA
   session.type 필수·VAD 미해제 시 가짜 측정값). **ADR-0007 승인** — AI 튜터는 Realtime, 레슨은 turn-based.

코드 측은 P1 전부 + P1.5 완료, W1 판정 확정. 남은 건 실기기 검증·U11 OAuth(준비 완료)·W2 착수다.

## Completed This Session

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | V1 재로그인 하이드레이트 — `onboarded_at` 마커 + profile-sync 재조회, 방어 검증·권위 출처 구분 | `3f90b77` | supabase/migrations/20260613000000_*.sql, apps/mobile/src/lib/profile-sync.ts(신규), stores/{user,user-core}.ts |
| 2 | V1 라우팅 — index.tsx hydrating 게이트, login.tsx imperative→반응형 effect(스테일 onboarded 우회 해소) | `3f90b77` | apps/mobile/src/app/{index,login,onboarding,_layout}.tsx |
| 3 | V2 reply clamp — `clampReply`/`MAX_REPLY_CHARS=400`, getTurnFeedback 적용 | `3f90b77` | packages/shared/src/feedback-schema.ts, packages/ai/src/tutor.ts |
| 4 | 보안 — in-flight 크로스유저 PII 주입 차단, 리스너 로그아웃 PII 정리(재수화 가드), LEARNING_GOALS 단일 출처 | `3f90b77` | profile-sync.ts, stores/user.ts, packages/shared/src/{content-schema,types}.ts |
| 5 | RLS 36/36(onboarded_at 케이스 3) + E2E supabase-flow S12(재로그인 스킵·DB 반영·PII) | `3f90b77` | scripts/verify-rls.mts, e2e/supabase-flow.spec.mjs |
| 6 | ADR-0006 + ADR-0005 한계 2건 해소 포인터, 실기기 체크리스트·U11 준비·P2 계획서 초안 | `3f90b77` | docs/adr/ADR-0006-*.md, docs/checklists/, docs/plans/{u11-oauth-prep,p2-tutor,p1-polish}.md |
| 7 | **W1 Realtime 스파이크 + 실측**(미커밋) — realtime.mts, ws devDep, 버그 3건 수정(VAD off 등), 실측 첫 응답 0.63s·barge-in 175ms·턴당 ~$0.006–0.010, ADR-0007 **승인** | 미커밋 | packages/ai/spike/realtime.mts(신규), packages/ai/package.json, docs/adr/ADR-0007-*.md(신규), docs/plans/p2-tutor.md, CHANGELOG.md, HANDOFF.md |

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **W1 Realtime 실측** | ✅ 완료 | gpt-realtime GA 실측 — 첫 응답 0.63s·barge-in 175ms·턴당 ~$0.006–0.010. **ADR-0007 승인**(AI 튜터 Realtime, 레슨 turn-based). 미커밋 — 이번 세션 커밋 대상 |
| 2 | 실기기 검증 (P1 완료 정의 ①②③) | 🔴 사용자 액션 | Xcode 미설치 → Expo Go. 체크리스트: `docs/checklists/p1-device-verification.md`. 턴 지연 중앙값 측정 → ADR-0003 갱신 |
| 3 | U11 Google/Apple OAuth | ⬜ 준비 완료 | 설계·준비: `docs/plans/u11-oauth-prep.md`(네이티브 ID 토큰 방식). 착수 전제: Apple Developer(구매 예정)·번들 ID·호스팅 Supabase·EAS dev build |
| 4 | 호스팅 Supabase 연결 | 🔴 사용자 액션 | 프로젝트 생성 → `supabase link` + `db push`(마이그레이션 3건) → EAS env |
| 5 | **Phase 2 W2 프리토킹 (착수 가능)** | ⬜ 계획 확정 | `docs/plans/p2-tutor.md` — 전송 계층 Realtime 확정(ADR-0007). tutor_sessions 스키마(보안 민감), 일일 시간 상한·세션 cap. 착수 전 우선순위 재확인 |
| 6 | 출시 전 Edge Function 프록시 | ⬜ P2 W7 | dev는 EXPO_PUBLIC_OPENAI_API_KEY, prod는 음성 비활성(ADR-0005 §6) |

## Key Decisions Made

- **ADR-0006(승인)**: 재로그인 하이드레이트 — `onboarded_at` 마커(grant 무해 분석), profile-sync 구독,
  스테일 응답 폐기(in-flight 사용자 전환 PII 차단), anti-flash(hydrating 동안 라우팅 대기),
  리스너 로그아웃 PII 정리. reply clamp는 회복형 절단(하드 실패 아님)
- **login.tsx 라우팅 단일 출처화**: imperative `routeAfterAuth`(스테일 onboarded·onAuthStateChange
  타이밍 결함)를 status·hydrating·onboarded 반응형 effect로 교체 — E2E S12b가 잡은 결함
- **ADR-0007(승인)**: 실측으로 확정 — 첫 응답 0.63s(≤2.5s 채택)·barge-in 175ms(<500ms 채택)·턴당
  ~$0.006–0.010(상한 전제 수용). AI 튜터(프리토킹·롤플레이)는 Realtime, 레슨은 turn-based 유지(Hybrid).
  비용은 일일 시간 상한·세션 길이 cap으로 통제(W2). 실사용 VAD는 on(자연 turn-taking)+클라 barge-in
- **W1 스파이크 입력 전략**: TTS `response_format=pcm`(24kHz=Realtime 입력 포맷)으로 사용자 발화
  자가 합성 — 파일·리샘플 의존 제거. preview↔GA 스키마/이벤트명 차이는 스파이크가 런타임 흡수
- **측정 함정(스파이크가 흡수)**: GA `session.update`는 `session.type:'realtime'` 필수 + 서버 VAD를
  안 끄면(`audio.input.turn_detection:null`) commit 입력이 `turn_detected`로 in-flight 응답을 자동
  취소해 0.04s·usage 0의 가짜 측정값이 나온다. session.updated + 턴 비취소로 VAD off 이중 검증

## Known Issues

- 동일 사용자 fetch 수명 내 재로그인 + 구 fetch 실패 시 hydrating 조기 해제(온보딩 flash, 데이터
  손상 없음) — 세대 토큰 도입 P2 W7 (ADR-0006 한계)
- 오프라인 콜드 스타트 INITIAL_SESSION(null) 시 로컬 카운터 와이프(가용성 LOW) — 필드 서버 승격 시 해소
- e2e mock-flow S10(supabase 폼 셀렉터) 실패 — 기존 known issue, supabase-flow S10은 PASS
- uuid <11.1.1 CVE(moderate, Expo 전이) — 수용 예외 유지, ADR-0004 부록
- 웹 user 스토어·mock progress는 메모리 폴백 — 새로고침 시 소실, 네이티브는 영속
- Realtime 단가는 2025-08 GA 기준(audio in $32/out $64 per 1M, 변동 가능) — 실행 시점 단가 변동 시
  realtime.mts `PRICE` 상수·ADR-0007 표 갱신. 모델명 불일치 시 `REALTIME_MODEL`로 오버라이드
- W1 실측은 헤드리스 노드 + TTS 합성 입력 기준 — RN WebRTC·실마이크·모바일 네트워크 경로 지연은
  W2 RN 연결 검증 + 실기기에서 별도 확인 필요(ADR-0007 한계)

## Context for Next Session

- **사용자 목표**: PLAN.md(v0.3) 기반 Speak 스타일 AI 영어 스피킹 앱. 품질 우선(D10), `/ted-run` 파이프라인, 프로토타입(prototype/index.html)이 UX 스펙
- **다음 작업 후보**: ① W2 프리토킹 착수(전송 계층 Realtime 확정, tutor_sessions 보안 민감 ted-run) ② 실기기 검증(체크리스트) → 지연 ADR-0003 반영 ③ U11 OAuth 전제 충족 후 착수
- **로컬 개발**: `supabase start`(553xx) → `supabase db reset`(마이그레이션 3건+시드 6레슨) → `npx tsx scripts/verify-rls.mts`(36케이스). 앱: `npm run mobile`, AI는 .env에 EXPO_PUBLIC_OPENAI_API_KEY(dev 전용)
- **스파이크**: `npm run spike -w @ted-speak/ai`(turn-based 1턴), `npm run spike:realtime -w @ted-speak/ai`(Realtime) — 둘 다 OPENAI_API_KEY 필요. ADR-0003(turn-based)·ADR-0007(Realtime) 근거 데이터
- **E2E**: `e2e/*.spec.mjs` — expo web(:8082)+Playwright. 스크린샷·results는 gitignore
- **제약·선호**: 커밋 한글, **푸시는 명시 요청 시에만**, StyleSheet+토큰만(인라인 hex 금지), zod z.infer 단일 출처, 새 컬럼은 grant 화이트리스트 검토, 스키마 변경은 보안 민감 ted-run
- **테스트 인프라**: vitest 272개·커버리지 93.4/86.1/96.5%(게이트 80). 신규 순수 모듈은 vitest.config.ts coverage.include에 등록 필요. `@ted-speak/shared` alias 제거 금지
- **미커밋 작업**: W1 Realtime 스파이크 + 실측(realtime.mts·ADR-0007 승인·p2-tutor·CHANGELOG·HANDOFF·package.json/lock의 ws devDep). 이번 세션 커밋 대상 — 푸시는 명시 요청 시에만
