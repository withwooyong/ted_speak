# Session Handoff — Ted Speak (TalkTed)

> Last updated: 2026-06-17 (KST) · 세션 12
> Branch: `main` (origin: github.com/withwooyong/ted_speak, **public**)
> Latest commit: 세션 12 repo 공개+시크릿 스캔(이 커밋) · 직전 origin/main `be482e4`(세션 11 인수인계) · **푸시 예정**

## Current Status

**세션 12는 repo 공개 전환 + 시크릿 스캔 도입 세션 — 앱/스키마 변경 없음**.

- **repo PRIVATE → PUBLIC**: `withwooyong/ted_speak`를 사용자 요청으로 public 전환. 전체 코드·커밋 히스토리 공개.
- **시크릿 노출 점검 — 안전 확인**: 전체 히스토리(31커밋) gitleaks 스캔 → **no leaks found**. 실제 OpenAI 키·
  `.env`·AWS·GitHub 토큰·Google·PEM **0건**. 검출된 `eyJ...` JWT 2종은 Supabase **로컬 데모 키**(공개 기본키,
  `scripts/verify-rls.mts` 한정). 키 폐기·히스토리 재작성 **불필요**.
- **재발 방지 게이트 추가**: `.gitleaks.toml`(기본 룰셋+데모 키 allowlist) + CI `secrets` 잡(push·PR마다 전체
  히스토리 스캔, 발견 시 빌드 실패) + `npm run secrets:scan` 로컬 스크립트. gitleaks로 실동작 검증 완료.
- **결론**: 공개 상태 그대로 안전. 향후 진짜 시크릿 커밋 시 CI가 차단. (상세: CHANGELOG 세션 12)

---

세션 10까지 코드 측 누적은 그대로 — **Phase 2 W6 주간 스피킹 리포트**를 일반 ted-run 풀 파이프라인으로
완료(커밋 `595cf9f`).

W5/W5b의 "기존 select RLS 재사용 + 순수 집계" 패턴을 한 번 더 연장 — 프로필 탭에 **최근 7일 리포트
카드**(발화 시간·완료 레슨 수·교정 TOP5)를 얹었다. **스키마 변경 0·신규 RPC 0**: `ProgressRepo`에
`listProgress()`(기존 "본인 진행도 조회" select RLS 재사용 — `user_progress`의 completed_at·
speaking_seconds·score 읽기)만 추가하고, 집계는 순수 `weekly-report.ts`(`sumSpeakingSeconds`·
`countCompletedLessons`·`topCorrections`·`collectWeeklyReport`)로 했다. 카드는 TanStack Query
(`['weekly-report']`)로 로드하고 프로필 포커스 시 invalidate(탭 마운트 유지 대응).

**정직성(ADR-0010 선례)**: 세 지표 모두 클라가 위조 불가한 서버 측 값만 — 발화는 레슨
speaking_seconds(완료 적재·불변) + 완료 튜터 duration(서버 RPC 산정, 진행 중 제외), 완료 수는
user_progress 행수(PK라 레슨당 1행), 교정은 기간 내 턴 corrections 빈도. **의도된 한계**: 레슨 발화는
최초 완료분만 집계, 기간은 rolling 7일(월요일 빈 카드 회피), 교정 턴은 started_at 필터(ADR-0011 W6 부록).

vitest **446**(419→+27), 커버리지 95.61/85.03/98.11/97.79(게이트 80), E2E mock **34/34**(S8 주간 카드
추가)·tutor **15/15** 회귀 무변경.

코드 측은 P1+P1.5+W1+W2+W3+W4+W5+W5b+W6 완료. 남은 건 실기기 검증·U11 OAuth·라이브 전송(dev build)·W7~다.

## Completed This Session (세션 12)

| # | Task | Files |
|---|------|-------|
| 1 | **repo 공개 전환** — PRIVATE → PUBLIC (`gh repo edit --visibility public`) | (GitHub 설정) |
| 2 | **시크릿 노출 점검** — 전체 히스토리 31커밋 gitleaks 스캔 → no leaks. 실제 키 0건, 검출 JWT는 Supabase 로컬 데모 키로 확인 | (검증) |
| 3 | **gitleaks 도입** — 기본 룰셋+데모 키 allowlist, CI secrets 잡(전체 히스토리 스캔), 로컬 `npm run secrets:scan` | .gitleaks.toml(신규), .github/workflows/ci.yml, package.json |

## Completed (세션 10 — 직전 코드 작업: W6 주간 리포트)

| # | Task | Files |
|---|------|-------|
| 1 | **저장소(주간 진행 읽기)** — listProgress(Mock+Supabase, 기존 select RLS 재사용), Mock progress 모델을 `{completedAt,speakingSeconds,score}` 레코드로 확장·first-write-wins(서버 PK 패리티)·구 문자열 포맷 정규화 | apps/mobile/src/lib/progress-repo.ts |
| 2 | **주간 집계(순수)** — weekStartMs/isWithinWeek/sumSpeakingSeconds/countCompletedLessons/topCorrections(빈도·정규화 dedupe·동률 안정)/buildWeeklyReport + 저장소 주입 통합 `collectWeeklyReport`(N+1 기간 가드) | apps/mobile/src/lib/weekly-report.ts(신규) |
| 3 | **UI(주간 카드)** — 프로필 "최근 7일" 카드(발화 분·완료 레슨·교정 TOP5 빈도·빈 상태), TanStack Query+포커스 invalidate, 토큰만. 프로필 ScrollView 전환(카드 높이 대응) | apps/mobile/src/components/profile/WeeklyReportCard.tsx(신규), apps/mobile/src/app/(tabs)/profile.tsx |
| 4 | **테스트·문서** — weekly-report 23(순수+collect)·progress-repo +5 테스트, vitest.config coverage.include(weekly-report.ts), E2E mock S8 주간 카드, ADR-0011 W6 부록, 작업계획서, p2-tutor §2 W6 완료 | apps/mobile/test/weekly-report.test.ts(신규), apps/mobile/test/progress-repo.test.ts, vitest.config.ts, e2e/mock-flow.spec.mjs, docs/adr/ADR-0011-*.md, docs/plans/p2-w6-weekly-report.md(신규), docs/plans/p2-tutor.md |

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **라이브 전송**(W2+W3 이월) | ⬜ dev build 전제 | `RealtimeTutorTransport`(WebRTC) 구현 + EAS dev build + react-native-webrtc. 실마이크 스트리밍·실기기 5분 완주·시나리오별 비용 재측정(ADR-0008). **롤플레이 목표 판정도 이때 모델 신호로 전환**(seam 계약 `metObjectiveIds` 기정의, ADR-0009) |
| 2 | 실기기 검증 (P1 완료 정의 ①②③) | 🔴 사용자 액션 | **세션 11 발견: Expo Go 불가** — 프로젝트 SDK 56을 Play 스토어 Expo Go가 미지원(버전 불일치 오류). 로컬도 전체 Xcode·Android SDK 부재로 시뮬/에뮬 불가. **경로는 EAS development build(실기기 APK, 권장) 또는 Android Studio 에뮬레이터**. 그 후 체크리스트 `docs/checklists/p1-device-verification.md`로 턴 지연 중앙값 측정 → ADR-0003 갱신. 화면/플로우만이면 웹(:8082)으로 즉시 확인 가능 |
| 3 | U11 Google/Apple OAuth | ⬜ 준비 완료 | 설계·준비: `docs/plans/u11-oauth-prep.md`(네이티브 ID 토큰 방식). 착수 전제: Apple Developer(구매 예정)·번들 ID·호스팅 Supabase·EAS dev build |
| 4 | 호스팅 Supabase 연결 | 🔴 사용자 액션 | 프로젝트 생성 → `supabase link` + `db push`(마이그레이션 5건) → EAS env |
| 5 | **W4 발음 후속(Azure)** | ⬜ 이월 | 진짜 음소·강세·억양 평가는 Azure Speech(또는 더 신뢰 가능한 미래 오디오 모델) 도입 시. `PronunciationAssessor` Azure 구현(seam 기정의) + `pronunciation_attempts` 테이블(보안 민감) 추가. ADR-0010 |
| 6 | ~~Phase 2 W6~~ | ✅ 완료(세션 10) | 주간 스피킹 리포트 — `listProgress()`+순수 `weekly-report.ts`, 프로필 "최근 7일" 카드. 후속: 레슨 재복습 발화 비정규화·교정 집계 N+1 제거·전주 대비 추세(`docs/plans/p2-w6-weekly-report.md` §5, Phase 3) |
| 7 | 출시 전 Edge Function 프록시 | ⬜ P2 W7 | dev는 EXPO_PUBLIC_OPENAI_API_KEY, prod는 음성 비활성(ADR-0005 §6) |
| 8 | **레슨 히스토리 메타 풍부화** | ⬜ 이월(W5b 후속) | 레슨 카드는 현재 상태(완료/진행 중)만 — 완료 점수(user_progress 조인)·발화시간·턴수는 비정규화 컬럼(보안 민감 스키마 변경) 또는 조인 추가 시점에. Phase 3 학습 정착과 함께 |

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
  zod 단일 출처. 목표 추적은 전송→코어 `metObjectiveIds` 신호이되, 코어가 **시나리오에 존재하는 id만
  채택·중복 제거(신뢰 경계)**. 모드 분리용 `tutor_sessions.kind`는 W5·W6에서 필요 시 도입
- **ADR-0011(승인 + W5b 부록)**: W5 히스토리는 **기존 RLS select 재사용**(신규 RPC·스키마 변경 0).
  `saved_expressions`는 **사용자 소유 노트라 delete 허용**(W2 불변 로그와 의도적 차이 — 파밍 표면 0),
  update 부재(스냅샷 불변), insert 컬럼 화이트리스트, 길이 CHECK+`unique`로 dedup 방어, 23505 idempotent.
  **W5b 부록(세션 9)**: 레슨 히스토리를 같은 읽기 패턴으로 실현 — 레슨 RLS 재사용으로 `ProgressRepo`에
  읽기 메서드만 추가, 순수 `mergeHistory`로 시간순 통합, `?kind`로 저장소 분기(IDOR은 RLS 0행),
  레슨 교정 저장은 `useSaveExpression` 공용. mock은 완료 세션 별도 보존
- **ADR-0010(승인)**: W4 발음은 **OpenAI 단독 음소 점수 불가**(스파이크 실측) → 정직한 최소 범위.
  whisper-1은 음소 오류를 자동교정해 거짓 100점, gpt-audio는 비결정적 환각. 진실한 것만: 단어 인식률
  (scoreDrill, "단어 인식" 라벨)+또렷함(avg_logprob 밴드, 조언만). 음소 평가는 `PronunciationAssessor`
  seam 뒤로 이월(Azure 드롭인), `pronunciation_attempts`는 정직한 데이터 없어 미생성

## Known Issues

- 동일 사용자 fetch 수명 내 재로그인 + 구 fetch 실패 시 hydrating 조기 해제(온보딩 flash, 데이터
  손상 없음) — 세대 토큰 도입 P2 W7 (ADR-0006 한계)
- 오프라인 콜드 스타트 INITIAL_SESSION(null) 시 로컬 카운터 와이프(가용성 LOW) — 필드 서버 승격 시 해소
- e2e mock-flow S10(supabase 폼 셀렉터) 실패 — 기존 known issue, supabase-flow S10은 PASS.
  supabase 모드 서버(:8083) 미기동 시 S9~11 스킵(세션 9 mock-flow 33/0/1)
- uuid <11.1.1 CVE(moderate, Expo 전이) — 수용 예외 유지, ADR-0004 부록
- 웹 user 스토어·mock progress/tutor는 메모리 폴백 — 새로고침 시 소실, 네이티브는 영속
- Realtime 단가는 2025-08 GA 기준(audio in $32/out $64 per 1M, 변동 가능) — 실행 시점 단가 변동 시
  realtime.mts `PRICE` 상수·ADR-0007 표 갱신. 모델명 불일치 시 `REALTIME_MODEL`로 오버라이드
- W1 실측은 헤드리스 노드 + TTS 합성 입력 기준 — RN WebRTC·실마이크·모바일 네트워크 경로 지연은
  W2 RN 연결 검증 + 실기기에서 별도 확인 필요(ADR-0007 한계)
- W4 또렷함(clarity)은 약한·복합 신호(억양 품질 아님) — 점수 아닌 보조 조언으로만 노출. 실마이크/모바일
  경로의 avg_logprob 분포는 실기기 검증에서 별도 확인 필요(ADR-0010 한계)
- gpt-4o-audio-preview는 이 계정에서 미접근(404) — 후속 오디오 LLM 검토 시 `gpt-audio`/`gpt-audio-mini` 사용
- **레슨 히스토리 카드 메타는 상태(완료/진행 중)만** — 발화시간·턴수가 lesson_sessions에 비정규화돼
  있지 않아 목록 N+1 회피(상세는 전체 턴 재생). 풍부화는 이월(In Progress #8)
- **주간 리포트(W6) 의도된 한계**: ① 레슨 발화 시간은 최초 완료분만 집계(user_progress 레슨당 1행 —
  재복습 발화 미적재, 튜터는 매 세션 누적) ② 교정 TOP5는 기간 내 세션 턴 N+1 조회(주간 세션 수 적어
  수용, 비정규화는 후속) ③ 기간은 rolling 7일. 모두 ADR-0011 W6 부록에 문서화. 풍부화는 Phase 3

## Context for Next Session

- **사용자 목표**: PLAN.md(v0.3) 기반 Speak 스타일 AI 영어 스피킹 앱. 품질 우선(D10), `/ted-run` 파이프라인, 프로토타입(prototype/index.html)이 UX 스펙
- **다음 작업 후보**(W6 완료): ① 라이브 전송(EAS dev build + react-native-webrtc, ADR-0008·0009 이월 — 사용자 액션 전제) ② 실기기 검증(체크리스트) → 지연 ADR-0003 반영 ③ U11 OAuth 전제 충족 후 착수 ④ W4 발음 후속(Azure 음소평가 — PronunciationAssessor seam에 드롭인, ADR-0010) ⑤ W7 출시 전 Edge Function 프록시(ADR-0005 §6) ⑥ 후속 풍부화(레슨 재복습 발화 비정규화·주간 추세·레슨 히스토리 점수 조인, Phase 3)
- **로컬 개발**: `supabase start`(553xx) → `supabase db reset`(마이그레이션 5건+시드 6레슨) → `npx tsx scripts/verify-rls.mts`(64케이스). 앱: `npm run mobile`, AI는 .env에 EXPO_PUBLIC_OPENAI_API_KEY(dev 전용)
- **스파이크**: `npm run spike -w @ted-speak/ai`(turn-based 1턴), `spike:realtime`(Realtime), `spike:pron`(발음) — 모두 OPENAI_API_KEY 필요. ADR-0003·0007·0010 근거 데이터. out/는 gitignore
- **E2E**: `e2e/*.spec.mjs` — expo web(:8082, `cd apps/mobile && npx expo start --web --port 8082`)+Playwright. `node e2e/tutor-flow.spec.mjs`(튜터 15/15), `node e2e/mock-flow.spec.mjs`(레슨 동선 33/0/1, supabase 모드 미기동 시 S9~11 스킵). 스크린샷·results는 gitignore
- **주간 리포트 아키텍처(W6)**: `progress-repo.listProgress()`(user_progress 읽기, 기존 select RLS 재사용) + 순수 `weekly-report.ts`(`collectWeeklyReport`가 저장소 주입받아 기간 내 세션 턴만 조회 — N+1 가드). 프로필 `components/profile/WeeklyReportCard.tsx`는 `['weekly-report']` TanStack Query + 포커스 invalidate. Mock `progress`는 레코드+first-write-wins(서버 PK 패리티). 정직성·한계는 ADR-0011 W6 부록
- **히스토리·저장 아키텍처(W5+W5b)**: 튜터는 `tutor-repo`, 레슨은 `progress-repo`의 읽기 메서드(`listSessions`/`getSession`/`getSessionTurns` — 둘 다 기존 RLS select 재사용, 신규 RPC 0). 대화 기록 화면은 순수 `history.ts`의 `mergeHistory(tutor, lesson)`로 시간순 통합(`app/history/index.tsx`), 상세는 `?kind=lesson|tutor`로 저장소 분기(`app/history/[id].tsx`). 제목 해석(`sessionTitle`/`lessonTitle`)은 content 의존이라 화면 레이어. 저장은 `saved_expressions`+`saved-repo`+`useSaveExpression` 훅(튜터·히스토리·**레슨 ConversationStep** 공용, 저장소는 출처 무관). 신규 화면 비동기 로드는 TanStack Query(effect 동기 setState 회피)
- **튜터 아키텍처(W2+W3)**: 순수 코어(`tutor-core.ts`)+저장소(`tutor-repo.ts`)+전송 seam(`tutor-transport.ts`, Mock/Roleplay/Realtime이월)+팩토리(`tutor.ts`)+UI(`(tabs)/tutor.tsx`). 완료는 `complete_tutor_session` RPC 필수. 롤플레이 콘텐츠는 `content/roleplay/*.json`(zod, validate:content 가드)
- **발음 아키텍처(W4)**: 순수 코어(`packages/shared/src/pronunciation.ts`, `PronunciationAssessor` seam)+STT(`transcribeDetailed`)+어댑터+UI(DrillStep 라벨 reframe·clarity 조언). Azure 음소평가는 seam에 드롭인+`pronunciation_attempts` 테이블 추가 지점(ADR-0010)
- **제약·선호**: 커밋 한글, **푸시는 명시 요청 시에만**, StyleSheet+토큰만(인라인 hex 금지), zod z.infer 단일 출처, 새 컬럼은 grant 화이트리스트 검토, 스키마 변경은 보안 민감 ted-run. **품질 우선 — 가짜 점수/지표 출시 안 함(ADR-0010 선례)**. 신규 화면 비동기 로드는 TanStack Query 패턴(수동 fetch-in-effect는 lint 차단). **Expo 타입드 라우트**: 새 라우트 추가 시 `.expo/types/router.d.ts` stale → typecheck 실패, expo web 한 번 띄워 번들(curl)하면 typegen 재생성
- **테스트 인프라**: vitest 419개·커버리지 95.43/84.81/97.89/97.64%(게이트 80). 신규 순수 모듈은 `packages/**/src/**` 글롭으로 자동 포함(app lib는 vitest.config.ts coverage.include에 개별 등록 — history.ts 등록됨). `@ted-speak/shared` alias 제거 금지(`@ted-speak/content`·`@/`는 vitest alias 없음 → 테스트 대상 lib는 그 둘을 런타임 import 금지, 타입 only는 가능)
- **실행/검증 경로(세션 11 확정)**: ① **웹** — `cd apps/mobile && npx expo start --web --port 8082`(8081은 ted_duolingo 점유) → 로그인 화면 "Dev Mock 로그인"으로 전 플로우 확인 가능, 화면/UX 검증용. ② **Expo Go 불가** — SDK 56 미지원(버전 불일치). ③ **네이티브/음성** — EAS dev build(실기기 APK, 권장) 또는 Android Studio 에뮬레이터 필요. 맥엔 전체 Xcode·Android SDK 둘 다 없음(CLT만). 터널 모드는 `@expo/ngrok` 전역 설치돼 있음(`--tunnel`)
- **repo 공개·시크릿 게이트(세션 12)**: repo는 이제 **public**. CI에 gitleaks `secrets` 잡 추가(push·PR마다 `fetch-depth:0` 전체 히스토리 스캔, 발견 시 실패) + `.gitleaks.toml`(데모 키 allowlist) + `npm run secrets:scan`. 전체 히스토리 스캔 결과 진짜 시크릿 0건 확인. **새 시크릿을 커밋하면 CI가 차단**하므로 실키는 계속 .env(gitignore)에만. gitleaks 로컬 설치는 `brew install gitleaks`
- **미커밋 작업**: 없음 — 세션 12 repo 공개+시크릿 스캔(CHANGELOG·HANDOFF·.gitleaks.toml·ci.yml·package.json) 커밋이 이 세션 유일 변경(앱 코드 0). 직전 origin/main(`be482e4`, 세션 11 인수인계) 동기화 완료
