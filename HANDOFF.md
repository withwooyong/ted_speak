# Session Handoff — Ted Speak (TalkTed)

> Last updated: 2026-06-13 (KST) · 세션 6
> Branch: `main` (origin: github.com/withwooyong/ted_speak, private)
> Latest commit: `9b2c922` - W3 롤플레이 (커밋 완료, **푸시 미요청**) · 직전 푸시 `59cfb74`(W2)

## Current Status

세션 6에서 **Phase 2 W3 롤플레이**를 일반 ted-run 풀 파이프라인으로 완료(커밋 대기).

**W3 롤플레이** — W2 프리토킹 seam을 재사용해 새 테이블·전송 없이 롤플레이(레스토랑·공항·면접·호텔)를
추가. scenario id를 `tutor_sessions.topic`에 저장, 일일 캡·세션 cap 공유(스키마 변경 없음 → 보안 민감
아님, ADR-0009). 콘텐츠는 `content/roleplay/*.json` + zod 단일 출처, 목표 추적은 전송→코어
`metObjectiveIds` 신호(코어가 신뢰 경계 — 시나리오 존재 id만 채택). 프리토킹 동선은 무변경 회귀.
vitest 353·E2E tutor 10/10(프리토킹 6 + 롤플레이 4).

코드 측은 P1+P1.5+W1+W2+W3 완료. 남은 건 실기기 검증·U11 OAuth·라이브 전송(dev build)·W4~다.

## Completed This Session (세션 6)

| # | Task | Files |
|---|------|-------|
| 1 | **W3 콘텐츠 스키마 + 시드 4종** — RoleplayScenario/Collection zod(objectives 2~4·id 고유 refine), content/roleplay/scenarios.json, 로드 검증 + findScenario | packages/shared/src/content-schema.ts, content/roleplay/scenarios.json(신규), content/index.ts, packages/shared/test/content-schema.test.ts |
| 2 | **W3 코어 목표 추적**(순수, additive) — objectives 주입·metObjectiveIds 머지(신뢰 경계)·goal 요약. 프리토킹 goal=null 회귀 | apps/mobile/src/lib/tutor-core.ts, apps/mobile/test/tutor-core.test.ts |
| 3 | **W3 전송** — TutorReply.metObjectiveIds + createRoleplayMockTransport(턴마다 목표 1개 결정적 신호) | apps/mobile/src/lib/tutor-transport.ts, apps/mobile/test/tutor-transport.test.ts |
| 4 | **W3 UI** — 롤플레이 섹션(배역 배지)·목표 체크리스트·openingLine 첫 버블·목표 달성 판정 카드(토큰만) | apps/mobile/src/app/(tabs)/tutor.tsx |
| 5 | **W3 검증** — vitest 353(커버리지 94.7/87.3/97.2), E2E tutor 10/10, ADR-0009, 작업계획서 | e2e/tutor-flow.spec.mjs, docs/adr/ADR-0009-*.md(신규), docs/plans/p2-w3-roleplay.md(신규) |

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **라이브 전송**(W2+W3 이월) | ⬜ dev build 전제 | `RealtimeTutorTransport`(WebRTC) 구현 + EAS dev build + react-native-webrtc. 실마이크 스트리밍·실기기 5분 완주·시나리오별 비용 재측정(ADR-0008). **롤플레이 목표 판정도 이때 모델 신호로 전환**(seam 계약 `metObjectiveIds` 기정의, ADR-0009) |
| 2 | 실기기 검증 (P1 완료 정의 ①②③) | 🔴 사용자 액션 | Xcode 미설치 → Expo Go. 체크리스트: `docs/checklists/p1-device-verification.md`. 턴 지연 중앙값 측정 → ADR-0003 갱신 |
| 3 | U11 Google/Apple OAuth | ⬜ 준비 완료 | 설계·준비: `docs/plans/u11-oauth-prep.md`(네이티브 ID 토큰 방식). 착수 전제: Apple Developer(구매 예정)·번들 ID·호스팅 Supabase·EAS dev build |
| 4 | 호스팅 Supabase 연결 | 🔴 사용자 액션 | 프로젝트 생성 → `supabase link` + `db push`(마이그레이션 4건) → EAS env |
| 5 | **Phase 2 W4~** | ⬜ 계획 | W4 발음(스파이크 선행)·W5 히스토리·W6 주간 리포트 (`docs/plans/p2-tutor.md`). W2/W3 코어·전송 seam 재사용. W5·W6에서 프리토킹/롤플레이 분리 필요 시 `tutor_sessions.kind` 도입(보안 민감) |
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
- **ADR-0008(승인)**: W2는 `TutorTransport` 인터페이스(seam) 뒤에 기반부터 구현, 라이브 WebRTC 전송은
  dev build 후속 이월. 라이브 타깃은 react-native-webrtc(권장), WebSocket+PCM은 폴백 후보
- **W2 안티-파밍(보안 리뷰 HIGH 반영)**: tutor_sessions는 `revoke insert,update` + `grant insert(user_id,
  topic)`만. 완료(duration·turn_count·status 확정)는 `complete_tutor_session` SECURITY DEFINER RPC로만 —
  duration_seconds를 서버가 `now()-started_at`로 산정(클라 위조 차단). 캡은 완료 duration + 진행 중
  경과시간(미완료 우회 차단) 합산. tutor duration은 profiles 통계에 누적 안 함(farming 표면 회피)
- **ADR-0009(승인)**: W3 롤플레이는 W2 seam 재사용 — 새 테이블·전송 없이 scenario id를
  `tutor_sessions.topic`에 저장(일일 캡·cap 공유, 스키마 변경 없음). 롤플레이 콘텐츠는 content/ JSON +
  zod 단일 출처(프리토킹 주제는 코드 상수와 대비). 목표 추적은 전송→코어 `metObjectiveIds` 신호이되,
  코어가 **시나리오에 존재하는 id만 채택·중복 제거(신뢰 경계)** — 목표 달성이 향후 보상/통계 연계
  가능성이 있어 클라/모델 신호 무비판 수용 안 함. 모드 분리용 `tutor_sessions.kind`는 W5·W6에서 필요 시 도입

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
- **다음 작업 후보**: ① W4 발음(스파이크 선행 — Azure vs Whisper, ADR 결정) ② 라이브 전송(EAS dev build + react-native-webrtc, ADR-0008·0009 이월) ③ 실기기 검증(체크리스트) → 지연 ADR-0003 반영 ④ U11 OAuth 전제 충족 후 착수 ⑤ W5 히스토리/W6 주간 리포트(W2/W3 세션 데이터 재사용)
- **로컬 개발**: `supabase start`(553xx) → `supabase db reset`(마이그레이션 4건+시드 6레슨) → `npx tsx scripts/verify-rls.mts`(52케이스). 앱: `npm run mobile`, AI는 .env에 EXPO_PUBLIC_OPENAI_API_KEY(dev 전용)
- **스파이크**: `npm run spike -w @ted-speak/ai`(turn-based 1턴), `npm run spike:realtime -w @ted-speak/ai`(Realtime) — 둘 다 OPENAI_API_KEY 필요. ADR-0003(turn-based)·ADR-0007(Realtime) 근거 데이터
- **E2E**: `e2e/*.spec.mjs` — expo web(:8082, `cd apps/mobile && npx expo start --web --port 8082`)+Playwright. `node e2e/tutor-flow.spec.mjs`(튜터 10/10 — 프리토킹 6+롤플레이 4). 스크린샷·results는 gitignore
- **튜터 아키텍처(W2+W3)**: 순수 코어(`tutor-core.ts`, objectives 추적 포함)+저장소(`tutor-repo.ts`)+전송 seam(`tutor-transport.ts`, Mock/Roleplay/Realtime이월)+팩토리(`tutor.ts`)+UI(`(tabs)/tutor.tsx`). 롤플레이는 같은 seam·`tutor_sessions` 재사용(scenario id를 topic에). 라이브 전송만 교체하면 됨. 완료는 `complete_tutor_session` RPC 필수. 롤플레이 콘텐츠는 `content/roleplay/*.json`(zod, validate:content 가드)
- **제약·선호**: 커밋 한글, **푸시는 명시 요청 시에만**, StyleSheet+토큰만(인라인 hex 금지), zod z.infer 단일 출처, 새 컬럼은 grant 화이트리스트 검토, 스키마 변경은 보안 민감 ted-run
- **테스트 인프라**: vitest 353개·커버리지 94.7/87.3/97.2%(게이트 80). istanbul 텍스트 리포터는 100% 커버 파일 생략(skipFull). 신규 순수 모듈은 vitest.config.ts coverage.include에 등록 필요. `@ted-speak/shared` alias 제거 금지
- **미커밋 작업**: 없음 — W3 롤플레이 커밋 완료(`9b2c922`, **푸시 미요청**). 이 HANDOFF 해시 부기 1줄만 미커밋(다음 세션 /handoff 시 흡수)
