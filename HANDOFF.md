# Session Handoff — Ted Speak (TalkTed)

> Last updated: 2026-06-13 (KST) · 세션 5
> Branch: `main` (origin: github.com/withwooyong/ted_speak, private)
> Latest commit: `add6d52` - W1 Realtime 실측·ADR-0007 승인 (푸시 완료) · **미커밋: W2 프리토킹 기반**

## Current Status

세션 5에서 W1 Realtime 실측(커밋·푸시 `add6d52`)에 이어 **W2 프리토킹 기반을 보안 민감 ted-run
풀 파이프라인으로 완료**했다(미커밋).

1. **W1 Realtime 실측**(커밋·푸시 `add6d52`) — gpt-realtime GA 첫 응답 0.63s·barge-in 175ms.
   ADR-0007 승인(AI 튜터 Realtime, 레슨 turn-based).
2. **W2 프리토킹 기반**(미커밋) — **기반부터** 전략: Expo Go에서 완결 가능한 토대(스키마/RLS·세션
   상태머신·일일 캡·UI)를 `TutorTransport` 인터페이스 뒤에 구현. 목 전송 + 텍스트 미리보기로 동선
   완결. **라이브 WebRTC 전송·실기기는 dev build 후속 이월**(ADR-0008). 적대적 보안 리뷰가 잡은
   일일 캡 위조(HIGH)를 서버 권위 RPC로 해소(RLS 52/52). vitest 327·E2E tutor 6/6.

코드 측은 P1+P1.5+W1+W2 기반 완료. 남은 건 실기기 검증·U11 OAuth·W2 라이브 전송(dev build)·W3~다.

## Completed This Session

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | **W1 Realtime 실측** — gpt-realtime GA 첫 응답 0.63s·barge-in 175ms·턴당 ~$0.006–0.010, 스파이크 버그 3건 수정, ADR-0007 승인 | `add6d52` | packages/ai/spike/realtime.mts, package.json, docs/adr/ADR-0007-*.md, docs/plans/p2-tutor.md |
| 2 | **W2 스키마/RLS**(보안) — tutor_sessions/tutor_turns, 컬럼 lockdown + `complete_tutor_session` 서버 권위 RPC(캡 위조 차단), RLS 52/52 | 미커밋 | supabase/migrations/20260613100000_tutor_sessions.sql(신규), scripts/verify-rls.mts |
| 3 | **W2 세션 코어/저장소**(순수) — tutor-core(상태머신·5분 cap·6턴 윈도우·요약), tutor-repo(mock/supabase·일일 캡·미완료 우회 차단) | 미커밋 | apps/mobile/src/lib/tutor-core.ts·tutor-repo.ts·tutor.ts(신규) |
| 4 | **W2 전송 계층** — TutorTransport 인터페이스 + MockTutorTransport(텍스트 미리보기) + RealtimeTutorTransport 이월 스텁 | 미커밋 | apps/mobile/src/lib/tutor-transport.ts(신규) |
| 5 | **W2 UI** — tutor 탭 주제→세션→요약, 일일 캡 잠금, 텍스트 폴백 | 미커밋 | apps/mobile/src/app/(tabs)/tutor.tsx |
| 6 | **W2 검증** — vitest 327(커버리지 등록), E2E tutor-flow 6/6, ADR-0008, 작업계획서 | 미커밋 | apps/mobile/test/tutor-*.test.ts(신규), e2e/tutor-flow.spec.mjs(신규), vitest.config.ts, docs/adr/ADR-0008-*.md(신규), docs/plans/p2-w2-pretalk.md(신규) |

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **W1 Realtime 실측** | ✅ 완료 | gpt-realtime GA 실측 — 첫 응답 0.63s·barge-in 175ms·턴당 ~$0.006–0.010. **ADR-0007 승인**(AI 튜터 Realtime, 레슨 turn-based). 미커밋 — 이번 세션 커밋 대상 |
| 2 | 실기기 검증 (P1 완료 정의 ①②③) | 🔴 사용자 액션 | Xcode 미설치 → Expo Go. 체크리스트: `docs/checklists/p1-device-verification.md`. 턴 지연 중앙값 측정 → ADR-0003 갱신 |
| 3 | U11 Google/Apple OAuth | ⬜ 준비 완료 | 설계·준비: `docs/plans/u11-oauth-prep.md`(네이티브 ID 토큰 방식). 착수 전제: Apple Developer(구매 예정)·번들 ID·호스팅 Supabase·EAS dev build |
| 4 | 호스팅 Supabase 연결 | 🔴 사용자 액션 | 프로젝트 생성 → `supabase link` + `db push`(마이그레이션 4건) → EAS env |
| 5 | **W2 라이브 전송**(이월) | ⬜ dev build 전제 | `RealtimeTutorTransport`(WebRTC) 구현 + EAS dev build + react-native-webrtc. 실마이크 스트리밍·실기기 5분 완주·시나리오별 비용 재측정(ADR-0008 §이월) |
| 6 | **Phase 2 W3~** | ⬜ 계획 | W3 롤플레이·W4 발음·W5 히스토리·W6 주간 리포트 (`docs/plans/p2-tutor.md`). W2 코어·전송 인터페이스 재사용 |
| 7 | 출시 전 Edge Function 프록시 | ⬜ P2 W7 | dev는 EXPO_PUBLIC_OPENAI_API_KEY, prod는 음성 비활성(ADR-0005 §6) |

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
- **ADR-0008(승인)**: W2는 `TutorTransport` 인터페이스(seam) 뒤에 기반부터 구현, 라이브 WebRTC 전송은
  dev build 후속 이월. 라이브 타깃은 react-native-webrtc(권장), WebSocket+PCM은 폴백 후보
- **W2 안티-파밍(보안 리뷰 HIGH 반영)**: tutor_sessions는 `revoke insert,update` + `grant insert(user_id,
  topic)`만. 완료(duration·turn_count·status 확정)는 `complete_tutor_session` SECURITY DEFINER RPC로만 —
  duration_seconds를 서버가 `now()-started_at`로 산정(클라 위조 차단). 캡은 완료 duration + 진행 중
  경과시간(미완료 우회 차단) 합산. tutor duration은 profiles 통계에 누적 안 함(farming 표면 회피)

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
- **다음 작업 후보**: ① W2 라이브 전송(EAS dev build + react-native-webrtc, ADR-0008 이월) ② 실기기 검증(체크리스트) → 지연 ADR-0003 반영 ③ U11 OAuth 전제 충족 후 착수 ④ W3 롤플레이(W2 코어·전송 인터페이스 재사용)
- **로컬 개발**: `supabase start`(553xx) → `supabase db reset`(마이그레이션 4건+시드 6레슨) → `npx tsx scripts/verify-rls.mts`(52케이스). 앱: `npm run mobile`, AI는 .env에 EXPO_PUBLIC_OPENAI_API_KEY(dev 전용)
- **스파이크**: `npm run spike -w @ted-speak/ai`(turn-based 1턴), `npm run spike:realtime -w @ted-speak/ai`(Realtime) — 둘 다 OPENAI_API_KEY 필요. ADR-0003(turn-based)·ADR-0007(Realtime) 근거 데이터
- **E2E**: `e2e/*.spec.mjs` — expo web(:8082, `cd apps/mobile && npx expo start --web --port 8082`)+Playwright. `node e2e/tutor-flow.spec.mjs`(튜터 6/6). 스크린샷·results는 gitignore
- **W2 아키텍처**: 순수 코어(`tutor-core.ts`)+저장소(`tutor-repo.ts`)+전송 인터페이스(`tutor-transport.ts`)+팩토리(`tutor.ts`)+UI(`(tabs)/tutor.tsx`). 라이브 전송만 교체하면 됨(seam). 완료는 `complete_tutor_session` RPC 필수(직접 update 금지)
- **제약·선호**: 커밋 한글, **푸시는 명시 요청 시에만**, StyleSheet+토큰만(인라인 hex 금지), zod z.infer 단일 출처, 새 컬럼은 grant 화이트리스트 검토, 스키마 변경은 보안 민감 ted-run
- **테스트 인프라**: vitest 327개·커버리지 94.3/86.4/96.9%(게이트 80). 신규 순수 모듈은 vitest.config.ts coverage.include에 등록 필요. `@ted-speak/shared` alias 제거 금지
- **미커밋 작업**: W2 프리토킹 기반(tutor_sessions 마이그레이션·tutor-{core,repo,transport,}.ts·tutor.tsx·테스트·verify-rls·ADR-0008·p2-w2-pretalk·CHANGELOG·HANDOFF·vitest.config). 이번 세션 커밋 대상 — 푸시는 명시 요청 시에만
