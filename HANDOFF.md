# Session Handoff — Ted Speak (TalkTed)

> Last updated: 2026-06-13 (KST) · 세션 8
> Branch: `main` (origin: github.com/withwooyong/ted_speak, private)
> Latest commit: `40868af` - W5 히스토리+표현저장(커밋 완료, **푸시 미요청**) · 직전 커밋 `52db5c3`(W4) · 직전 푸시 `59cfb74`(W2)

## Current Status

세션 8에서 **Phase 2 W5 대화 히스토리 + 표현 저장**을 보안 민감 ted-run 풀 파이프라인으로 완료(커밋 대기).

**W5 히스토리 + 표현 저장** — 두 부분. ① **히스토리는 기존 RLS select 재사용**(신규 RPC·스키마 변경 0):
`tutor-repo`에 `listSessions`/`getSession`/`getSessionTurns` 읽기 메서드만 추가. 타인 id URL(IDOR)도 RLS가
0행 반환 → 클라 소유권 체크 불요. **튜터 세션만**(레슨 이월). ② **표현 저장**은 유일한 신규 테이블
`saved_expressions`(보안 민감) — 사용자 소유 노트라 **delete 허용**(W2 불변 로그와 의도적 차이, 파밍 표면
0), **update 부재**(교정 스냅샷 불변), insert는 컬럼 화이트리스트(id·created_at 서버 default 위조 차단),
길이 CHECK(original/suggested 1~500, context ≤1000)+`unique(user_id,original,suggested)`로 dedup·abuse 방어.
교정 칩 길게 눌러 저장(`useSaveExpression` 훅, 낙관적+실패 롤백)은 튜터·히스토리 상세가 공유(ADR-0011).

vitest **400**(369→+31), 커버리지 95.31/86.04/97.71, E2E tutor **15/15**(W5 5건: 교정 저장✓·히스토리 목록·
상세 재생·복습 목록), mock 33/33 회귀, verify-rls **64/64**(52→+12).

코드 측은 P1+P1.5+W1+W2+W3+W4+W5 완료. 남은 건 실기기 검증·U11 OAuth·라이브 전송(dev build)·W6~다.

## Completed This Session (세션 8)

| # | Task | Files |
|---|------|-------|
| 1 | **스키마** — saved_expressions 테이블(RLS select/insert/delete·update 부재·컬럼 화이트리스트·길이/unique CHECK) | supabase/migrations/20260613110000_saved_expressions.sql(신규) |
| 2 | **타입·저장소(표현)** — SavedExpression zod(Correction 재사용·z.infer), Mock/Supabase saved-repo(23505 idempotent·delete) + 팩토리 | packages/shared/src/feedback-schema.ts, apps/mobile/src/lib/saved-repo.ts(신규)·saved.ts(신규), apps/mobile/test/saved-repo.test.ts(신규) |
| 3 | **저장소(히스토리 읽기)** — listSessions/getSession/getSessionTurns + Mock 턴·요약 보존(rowToSummary/mockToSummary 공유) | apps/mobile/src/lib/tutor-repo.ts, apps/mobile/test/tutor-repo.test.ts |
| 4 | **UI** — 프로필 진입 카드 2개, history 목록·상세(턴 재생), saved 복습 목록(삭제), 교정 칩 길게 눌러 저장 훅. 데이터 로드는 TanStack Query(effect 동기 setState 회피) | apps/mobile/src/app/(tabs)/profile.tsx·tutor.tsx, app/history/index.tsx·[id].tsx(신규), app/saved/index.tsx(신규), src/hooks/use-save-expression.ts(신규) |
| 5 | **검증·문서** — verify-rls +12케이스(64/64), E2E tutor T11~15(신규), ADR-0011, 작업계획서, p2-tutor.md W5 동기화, vitest.config coverage.include(saved-repo) | scripts/verify-rls.mts, e2e/tutor-flow.spec.mjs, docs/adr/ADR-0011-*.md(신규), docs/plans/p2-w5-history.md(신규), docs/plans/p2-tutor.md, vitest.config.ts |

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **라이브 전송**(W2+W3 이월) | ⬜ dev build 전제 | `RealtimeTutorTransport`(WebRTC) 구현 + EAS dev build + react-native-webrtc. 실마이크 스트리밍·실기기 5분 완주·시나리오별 비용 재측정(ADR-0008). **롤플레이 목표 판정도 이때 모델 신호로 전환**(seam 계약 `metObjectiveIds` 기정의, ADR-0009) |
| 2 | 실기기 검증 (P1 완료 정의 ①②③) | 🔴 사용자 액션 | Xcode 미설치 → Expo Go. 체크리스트: `docs/checklists/p1-device-verification.md`. 턴 지연 중앙값 측정 → ADR-0003 갱신 |
| 3 | U11 Google/Apple OAuth | ⬜ 준비 완료 | 설계·준비: `docs/plans/u11-oauth-prep.md`(네이티브 ID 토큰 방식). 착수 전제: Apple Developer(구매 예정)·번들 ID·호스팅 Supabase·EAS dev build |
| 4 | 호스팅 Supabase 연결 | 🔴 사용자 액션 | 프로젝트 생성 → `supabase link` + `db push`(마이그레이션 4건) → EAS env |
| 5 | **W4 발음 후속(Azure)** | ⬜ 이월 | 진짜 음소·강세·억양 평가는 Azure Speech(또는 더 신뢰 가능한 미래 오디오 모델) 도입 시. `PronunciationAssessor` Azure 구현(seam 기정의) + `pronunciation_attempts` 테이블(보안 민감) 추가. ADR-0010 |
| 6 | **Phase 2 W6** | ⬜ 계획 | 주간 스피킹 리포트 — `listSessions()`(W5) 집계 재사용, 교정 TOP5는 saved_expressions/턴 corrections 집계 (`docs/plans/p2-tutor.md`). W5·W6에서 프리토킹/롤플레이 분리 필요 시 `tutor_sessions.kind` 도입(보안 민감) |
| 8 | **W5 후속(레슨 히스토리)** | ⬜ 이월 | 히스토리는 현재 튜터 세션만. 레슨 세션(`lesson_sessions`/`conversation_turns` 본인 select)도 같은 읽기 패턴으로 확장 가능(ADR-0011). 표현 저장도 레슨 교정에 같은 `useSaveExpression` 핸들러 연결 |
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
- **ADR-0009(승인)**: W3 롤플레이는 W2 seam 재사용 — 새 테이블·전송 없이 scenario id를
  `tutor_sessions.topic`에 저장(일일 캡·cap 공유, 스키마 변경 없음). 롤플레이 콘텐츠는 content/ JSON +
  zod 단일 출처(프리토킹 주제는 코드 상수와 대비). 목표 추적은 전송→코어 `metObjectiveIds` 신호이되,
  코어가 **시나리오에 존재하는 id만 채택·중복 제거(신뢰 경계)** — 목표 달성이 향후 보상/통계 연계
  가능성이 있어 클라/모델 신호 무비판 수용 안 함. 모드 분리용 `tutor_sessions.kind`는 W5·W6에서 필요 시 도입
- **ADR-0011(승인)**: W5 히스토리는 **기존 RLS select 재사용**(신규 RPC·스키마 변경 0) — `tutor-repo`에
  `listSessions`/`getSession`/`getSessionTurns`만 추가, 타인 id(IDOR)는 RLS가 0행으로 차단(RLS가 신뢰
  경계). `saved_expressions`는 **사용자 소유 노트라 delete 허용**(W2 불변 로그·캡 표면과 의도적 차이 —
  통계·캡·보상 연결 0이라 파밍 표면 없음), update 부재(스냅샷 불변), insert 컬럼 화이트리스트(id·created_at
  서버 default 위조 차단), 길이 CHECK+`unique(user_id,original,suggested)`로 dedup 우회 대량저장 방어,
  중복은 23505를 클라가 삼켜 idempotent. 히스토리는 튜터만(레슨 이월). 교정 저장은 `useSaveExpression`
  훅(낙관적+실패 롤백)으로 튜터·히스토리 공유, 저장소는 출처 무관
- **ADR-0010(승인)**: W4 발음은 **스파이크 실측으로 OpenAI 단독 음소 점수 불가 확정** → 정직한 최소
  범위로 재정의. whisper-1은 음소 오류를 실단어로 자동교정해 거짓 100점(억양은 logprob Δ≈0으로 못
  구분), gpt-audio는 비결정적 환각. 가짜 점수는 D10·발음 좌절 리스크에 어긋나 출시 안 함. 진실한 것만:
  단어 인식률(scoreDrill, "발음 점수" 아닌 "단어 인식"으로 라벨)+또렷함(avg_logprob 밴드, 정확도 아닌
  전사 신뢰도, 조언으로만). 음소 평가는 `PronunciationAssessor` seam 뒤로 이월(Azure 드롭인),
  `pronunciation_attempts` 테이블은 채울 정직한 데이터 없어 미생성. 스파이크는 재현 아티팩트(`spike:pron`)로 유지

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
- W4 또렷함(clarity)은 약한·복합 신호(억양 품질 아님) — 점수 아닌 보조 조언으로만 노출. 실마이크/모바일
  경로의 avg_logprob 분포는 실기기 검증에서 별도 확인 필요(ADR-0010 한계). W4 스파이크 입력도 TTS 합성 기준
- gpt-4o-audio-preview는 이 계정에서 미접근(404) — 후속 오디오 LLM 검토 시 `gpt-audio`/`gpt-audio-mini` 사용

## Context for Next Session

- **사용자 목표**: PLAN.md(v0.3) 기반 Speak 스타일 AI 영어 스피킹 앱. 품질 우선(D10), `/ted-run` 파이프라인, 프로토타입(prototype/index.html)이 UX 스펙
- **다음 작업 후보**: ① W6 주간 리포트(W5 `listSessions()` 집계 재사용 — 코드로 착수 가능) ② W5 후속 레슨 히스토리(같은 읽기 패턴 확장, ADR-0011) ③ 라이브 전송(EAS dev build + react-native-webrtc, ADR-0008·0009 이월) ④ 실기기 검증(체크리스트) → 지연 ADR-0003 반영 ⑤ U11 OAuth 전제 충족 후 착수 ⑥ W4 발음 후속(Azure 음소평가 — PronunciationAssessor seam에 드롭인, ADR-0010)
- **로컬 개발**: `supabase start`(553xx) → `supabase db reset`(마이그레이션 5건+시드 6레슨) → `npx tsx scripts/verify-rls.mts`(64케이스). 앱: `npm run mobile`, AI는 .env에 EXPO_PUBLIC_OPENAI_API_KEY(dev 전용)
- **스파이크**: `npm run spike -w @ted-speak/ai`(turn-based 1턴), `spike:realtime`(Realtime), `spike:pron`(발음 — whisper logprob vs gpt-audio) — 모두 OPENAI_API_KEY 필요. ADR-0003·0007·0010 근거 데이터. out/는 gitignore
- **E2E**: `e2e/*.spec.mjs` — expo web(:8082, `cd apps/mobile && npx expo start --web --port 8082`)+Playwright. `node e2e/tutor-flow.spec.mjs`(튜터 15/15 — 프리토킹 6+롤플레이 4+W5 히스토리·저장 5). 스크린샷·results는 gitignore
- **튜터 아키텍처(W2+W3)**: 순수 코어(`tutor-core.ts`, objectives 추적 포함)+저장소(`tutor-repo.ts`)+전송 seam(`tutor-transport.ts`, Mock/Roleplay/Realtime이월)+팩토리(`tutor.ts`)+UI(`(tabs)/tutor.tsx`). 롤플레이는 같은 seam·`tutor_sessions` 재사용(scenario id를 topic에). 라이브 전송만 교체하면 됨. 완료는 `complete_tutor_session` RPC 필수. 롤플레이 콘텐츠는 `content/roleplay/*.json`(zod, validate:content 가드)
- **발음 아키텍처(W4)**: 순수 코어(`packages/shared/src/pronunciation.ts` — assessPronunciation=scoreDrill 재사용+또렷함, assessClarity, `PronunciationAssessor` seam)+STT(`transcribeDetailed`=verbose_json→avgLogprob, 기존 transcribe 무변경)+어댑터(`transcribeUriDetailed`)+UI(DrillStep 라벨 reframe·clarity 조언). Azure 음소평가는 seam에 드롭인(phonemeScores 확장)+`pronunciation_attempts` 테이블 추가 지점(ADR-0010)
- **히스토리·저장 아키텍처(W5)**: 히스토리는 `tutor-repo`의 읽기 메서드(`listSessions`/`getSession`/`getSessionTurns` — 기존 RLS select 재사용, 신규 RPC 없음)+UI(`app/history/index.tsx`·`[id].tsx`, 프로필 진입). 저장은 `saved_expressions` 테이블+`saved-repo.ts`(Mock/Supabase, 23505 idempotent·delete)+`saved.ts` 팩토리+`useSaveExpression` 훅(낙관적+롤백, 튜터·히스토리 공유)+`app/saved/index.tsx`. SavedExpression zod는 `Correction` 재사용(feedback-schema). 신규 화면 데이터 로드는 TanStack Query(effect 동기 setState 회피 — react-hooks/set-state-in-effect). 레슨 히스토리·레슨 교정 저장은 이월(ADR-0011)
- **제약·선호**: 커밋 한글, **푸시는 명시 요청 시에만**, StyleSheet+토큰만(인라인 hex 금지), zod z.infer 단일 출처, 새 컬럼은 grant 화이트리스트 검토, 스키마 변경은 보안 민감 ted-run. **품질 우선 — 가짜 점수/지표 출시 안 함(ADR-0010 선례)**. 신규 화면 비동기 로드는 TanStack Query 패턴(수동 fetch-in-effect는 lint 차단)
- **테스트 인프라**: vitest 400개·커버리지 95.31/86.04/97.71%(게이트 80). istanbul 텍스트 리포터는 100% 커버 파일 생략(skipFull). 신규 순수 모듈은 `packages/**/src/**` 글롭으로 자동 포함(app lib는 vitest.config.ts coverage.include에 개별 등록 필요 — saved-repo 등록됨). `@ted-speak/shared` alias 제거 금지. **Expo 타입드 라우트**: 새 라우트 추가 시 `.expo/types/router.d.ts`가 stale → typecheck 실패. expo web을 한 번 띄워 번들(curl)하면 typegen 재생성됨
- **미커밋 작업**: 없음 — 세션 8 W5 커밋 완료 예정(커밋 대기). 푸시는 사용자 요청 시
