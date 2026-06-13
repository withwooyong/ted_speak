# Session Handoff — Ted Speak (TalkTed)

> Last updated: 2026-06-13 (KST) · 세션 7
> Branch: `main` (origin: github.com/withwooyong/ted_speak, private)
> Latest commit: `52db5c3` - W4 발음 정직한 최소 범위(커밋 완료, **푸시 미요청**) · 직전 커밋 `9b2c922`(W3) · 직전 푸시 `59cfb74`(W2)

## Current Status

세션 7에서 **Phase 2 W4 발음 피드백(정직한 최소 범위)**을 일반 ted-run 풀 파이프라인으로 완료(커밋 대기).

**W4 발음** — 스파이크(`npm run spike:pron`)로 **OpenAI 단독 발음 점수 불가**를 실측 확정(ADR-0010):
whisper-1은 음소 오류를 실단어로 자동교정해 거짓 100점(`ribber→river` 등 6개 중 3개 은폐), gpt-audio는
실행마다 거부/환각(완벽한 네이티브에 약점 음소 70점대)/깨진 JSON 비결정적. 가짜 점수 출시 안 함.
재정의: 진실한 것만 — ① 핵심 단어 인식률(scoreDrill 재사용, "발음 점수" 아닌 "단어 인식"으로 라벨
reframe) ② 또렷함(clarity, `avg_logprob` 밴드 — 발음 정확도 아닌 전사 신뢰도, 점수 아닌 조언으로만)
③ `PronunciationAssessor` seam(Azure 음소평가 드롭인 자리). `pronunciation_attempts` 테이블·음소 점수는
Azure 도입까지 이월(채울 정직한 데이터 없음). 신규 벤더·테이블·RLS 없음. vitest **369**(353→+16),
커버리지 94.97/87.96/97.32, E2E mock-flow 33/33(드릴 동선 무변경 회귀).

코드 측은 P1+P1.5+W1+W2+W3+W4 완료. 남은 건 실기기 검증·U11 OAuth·라이브 전송(dev build)·W5~다.

## Completed This Session (세션 7)

| # | Task | Files |
|---|------|-------|
| 1 | **W4 발음 스파이크** — whisper-1 logprob+정렬 vs gpt-audio 멀티모달 실측. 음소 치환 주입(th→s,v→b,f→p,r→l)으로 정밀도 한계 정량화 → ADR-0010 근거 | packages/ai/spike/pronunciation.mts(신규), packages/ai/package.json(spike:pron) |
| 2 | **순수 코어** — assessClarity(avg_logprob→밴드)·assessPronunciation(scoreDrill 재사용+또렷함)·PronunciationAssessor/localAssessor seam | packages/shared/src/pronunciation.ts(신규), packages/shared/test/pronunciation.test.ts(신규), packages/shared/index.ts |
| 3 | **STT 상세 전사** — transcribeDetailed(verbose_json→text+avgLogprob). 기존 transcribe 무변경(makeTranscribeInit/toBlob 헬퍼 추출, FormData 재시도 성질 보존) | packages/ai/src/stt.ts, packages/ai/test/stt.test.ts, packages/ai/index.ts |
| 4 | **Drill 연결** — transcribeUriDetailed 어댑터, scoreAndApply가 assessPronunciation 사용·avgLogprob 전달. 점수 링 라벨 "단어 인식" reframe + clarity 보조 조언(토큰만) | apps/mobile/src/lib/ai.ts, apps/mobile/src/app/lesson/[id].tsx, apps/mobile/src/components/lesson/DrillStep.tsx |
| 5 | **검증·문서** — vitest 369·E2E mock 33/33, ADR-0010, 작업계획서, p2-tutor.md §2·§4 동기화 | docs/adr/ADR-0010-*.md(신규), docs/plans/p2-w4-pronunciation.md(신규), docs/plans/p2-tutor.md |

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **라이브 전송**(W2+W3 이월) | ⬜ dev build 전제 | `RealtimeTutorTransport`(WebRTC) 구현 + EAS dev build + react-native-webrtc. 실마이크 스트리밍·실기기 5분 완주·시나리오별 비용 재측정(ADR-0008). **롤플레이 목표 판정도 이때 모델 신호로 전환**(seam 계약 `metObjectiveIds` 기정의, ADR-0009) |
| 2 | 실기기 검증 (P1 완료 정의 ①②③) | 🔴 사용자 액션 | Xcode 미설치 → Expo Go. 체크리스트: `docs/checklists/p1-device-verification.md`. 턴 지연 중앙값 측정 → ADR-0003 갱신 |
| 3 | U11 Google/Apple OAuth | ⬜ 준비 완료 | 설계·준비: `docs/plans/u11-oauth-prep.md`(네이티브 ID 토큰 방식). 착수 전제: Apple Developer(구매 예정)·번들 ID·호스팅 Supabase·EAS dev build |
| 4 | 호스팅 Supabase 연결 | 🔴 사용자 액션 | 프로젝트 생성 → `supabase link` + `db push`(마이그레이션 4건) → EAS env |
| 5 | **W4 발음 후속(Azure)** | ⬜ 이월 | 진짜 음소·강세·억양 평가는 Azure Speech(또는 더 신뢰 가능한 미래 오디오 모델) 도입 시. `PronunciationAssessor` Azure 구현(seam 기정의) + `pronunciation_attempts` 테이블(보안 민감) 추가. ADR-0010 |
| 6 | **Phase 2 W5~** | ⬜ 계획 | W5 히스토리·W6 주간 리포트 (`docs/plans/p2-tutor.md`). W2/W3 세션 데이터 재사용. W5·W6에서 프리토킹/롤플레이 분리 필요 시 `tutor_sessions.kind` 도입(보안 민감) |
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
- **다음 작업 후보**: ① W5 히스토리(W2/W3 세션 데이터 재사용 — 코드로 착수 가능) ② W6 주간 리포트(W5 데이터 의존) ③ 라이브 전송(EAS dev build + react-native-webrtc, ADR-0008·0009 이월) ④ 실기기 검증(체크리스트) → 지연 ADR-0003 반영 ⑤ U11 OAuth 전제 충족 후 착수 ⑥ W4 발음 후속(Azure 음소평가 — PronunciationAssessor seam에 드롭인, ADR-0010)
- **로컬 개발**: `supabase start`(553xx) → `supabase db reset`(마이그레이션 4건+시드 6레슨) → `npx tsx scripts/verify-rls.mts`(52케이스). 앱: `npm run mobile`, AI는 .env에 EXPO_PUBLIC_OPENAI_API_KEY(dev 전용)
- **스파이크**: `npm run spike -w @ted-speak/ai`(turn-based 1턴), `spike:realtime`(Realtime), `spike:pron`(발음 — whisper logprob vs gpt-audio) — 모두 OPENAI_API_KEY 필요. ADR-0003·0007·0010 근거 데이터. out/는 gitignore
- **E2E**: `e2e/*.spec.mjs` — expo web(:8082, `cd apps/mobile && npx expo start --web --port 8082`)+Playwright. `node e2e/tutor-flow.spec.mjs`(튜터 10/10 — 프리토킹 6+롤플레이 4). 스크린샷·results는 gitignore
- **튜터 아키텍처(W2+W3)**: 순수 코어(`tutor-core.ts`, objectives 추적 포함)+저장소(`tutor-repo.ts`)+전송 seam(`tutor-transport.ts`, Mock/Roleplay/Realtime이월)+팩토리(`tutor.ts`)+UI(`(tabs)/tutor.tsx`). 롤플레이는 같은 seam·`tutor_sessions` 재사용(scenario id를 topic에). 라이브 전송만 교체하면 됨. 완료는 `complete_tutor_session` RPC 필수. 롤플레이 콘텐츠는 `content/roleplay/*.json`(zod, validate:content 가드)
- **발음 아키텍처(W4)**: 순수 코어(`packages/shared/src/pronunciation.ts` — assessPronunciation=scoreDrill 재사용+또렷함, assessClarity, `PronunciationAssessor` seam)+STT(`transcribeDetailed`=verbose_json→avgLogprob, 기존 transcribe 무변경)+어댑터(`transcribeUriDetailed`)+UI(DrillStep 라벨 reframe·clarity 조언). Azure 음소평가는 seam에 드롭인(phonemeScores 확장)+`pronunciation_attempts` 테이블 추가 지점(ADR-0010)
- **제약·선호**: 커밋 한글, **푸시는 명시 요청 시에만**, StyleSheet+토큰만(인라인 hex 금지), zod z.infer 단일 출처, 새 컬럼은 grant 화이트리스트 검토, 스키마 변경은 보안 민감 ted-run. **품질 우선 — 가짜 점수/지표 출시 안 함(ADR-0010 선례)**
- **테스트 인프라**: vitest 369개·커버리지 94.97/87.96/97.32%(게이트 80). istanbul 텍스트 리포터는 100% 커버 파일 생략(skipFull). 신규 순수 모듈은 `packages/**/src/**` 글롭으로 자동 포함(app lib는 vitest.config.ts coverage.include에 개별 등록 필요). `@ted-speak/shared` alias 제거 금지
- **미커밋 작업**: 없음 — W4 발음 커밋(`52db5c3`) + 인수인계 문서 갱신 커밋 완료. 이번 세션은 푸시까지 진행
