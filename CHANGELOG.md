# CHANGELOG

## 2026-06-17 (세션 12) — repo 공개 전환 + 시크릿 스캔 도입 (앱 코드 변경 없음)

목적: GitHub repo를 public으로 전환하고, 노출 시크릿 점검 + 재발 방지 게이트 추가. **앱/스키마 변경 없음**.

### Changed
- **repo 가시성 PRIVATE → PUBLIC** — `gh repo edit withwooyong/ted_speak --visibility public`. 전체 코드·커밋 히스토리 공개.

### Added
- **gitleaks 시크릿 스캔 도입** (`.gitleaks.toml` 신규) — 기본 룰셋(`useDefault`) + Supabase 로컬 데모 키
  allowlist(header+`iss:supabase-demo` prefix 정규식). 데모 JWT는 모든 설치 공통 공개 기본키(localhost 전용)라 예외 처리.
- **CI `secrets` 잡** (`.github/workflows/ci.yml`) — push·PR마다 `gitleaks/gitleaks-action@v2`로 `fetch-depth:0`
  전체 히스토리 스캔. 시크릿 발견 시 빌드 실패. 개인 계정이라 라이선스 불필요(무료).
- **로컬 스캔 스크립트** (`package.json`) — `npm run secrets:scan`(`gitleaks detect --config .gitleaks.toml --redact`).

### 검증 (시크릿 노출 점검)
- 전체 커밋 히스토리(31커밋) gitleaks 스캔 → **no leaks found**. 실제 OpenAI 키(`sk-...`)·`.env`·AWS(`AKIA`)·
  GitHub 토큰·Google(`AIza`)·PEM 모두 **0건**. 검출된 `eyJ...` JWT 2종은 Supabase **로컬 데모 키**(공개 기본키, 실
  프로젝트 무효)로 확인 — `scripts/verify-rls.mts` 한정. `service_role` 다수 매치는 RLS 보안 모델 설명 주석/문서.
- **결론**: 진짜 시크릿 노출 없음 → 키 폐기·히스토리 재작성 불필요. CLAUDE.md "API 키 앱 번들 미내장" 원칙 준수 확인.

## 2026-06-15 (세션 11) — 앱 실행 검증 (코드 변경 없음)

목적: 실제 앱을 띄워 동작 확인. **코드/스키마 변경 없음** — 검증·환경 점검 + 인수인계 갱신만.

- **웹(react-native-web) 구동 확인**: `expo start --web`(:8082) + Playwright로 전 플로우 정상 —
  로그인 → **Dev Mock 로그인** → 온보딩 4단계(목표·레벨·목표량·마이크) → 홈(XP·레슨 목록 6개·하루 1개
  소프트 제한) → 레슨 상세(LEARN, 표현 카드). **콘솔/페이지 에러 0**. AI 키 미설정이라 레슨 상단 "AI 기능
  사용하려면 키 설정" 배너 노출(의도된 fallback), Supabase 미설정이라 Dev Mock Auth 부팅.
- **Expo Go 실기기(안드로이드) 차단 발견**: QR 스캔 시 **SDK 버전 불일치 오류** — 프로젝트는 Expo SDK 56
  (RN 0.85.3·React 19.2)인데 Play 스토어 Expo Go가 SDK 56 미지원. **Expo Go 경로는 막힘**. 터널 모드
  (`--tunnel`, @expo/ngrok 전역 설치)로 네트워크는 우회 가능하나 SDK 불일치는 동일.
- **로컬 네이티브 실행 제약**: 맥에 **전체 Xcode 없음(Command Line Tools만)** + **Android SDK 없음** →
  `expo run:ios`/`run:android` 불가, iOS 시뮬레이터·안드로이드 에뮬레이터 모두 부재.
- **결론**: 네이티브/음성(마이크·STT/TTS·AI 대화) 검증은 **EAS development build**(실기기 APK, 클라우드
  빌드라 로컬 설치 불필요 — 권장) 또는 Android Studio 설치 후 에뮬레이터가 필요. 빠른 화면/플로우 확인은
  웹으로 충분. → In Progress #2(실기기 검증) 갱신.
- 환경(레포 외): `@expo/ngrok` 전역 설치, 포트는 8081(ted_duolingo 점유) 회피해 8082(web)/8083(tunnel) 사용.

## 2026-06-13 (세션 10) — Phase 2 W6 주간 스피킹 리포트 (일반 ted-run, 커밋 `595cf9f`)

전략: **W5/W5b의 "기존 select RLS 재사용 + 순수 집계" 패턴을 한 번 더 연장** — 스키마 변경 0·신규 RPC 0.

- **주간 진행 읽기**(`progress-repo.ts`): `listProgress()` 추가(Mock+Supabase) — 기존 "본인 진행도 조회"
  select RLS 재사용(user_progress의 completed_at·speaking_seconds·score). Mock `progress`를
  `{completedAt,speakingSeconds,score}` 레코드로 확장 + **first-write-wins**(서버 PK (user_id,lesson_id)
  불변·트리거 1회 누적 패리티) + 구 문자열 포맷 읽기 시 정규화.
- **주간 집계**(`weekly-report.ts` 신규): 순수 함수 `weekStartMs`/`isWithinWeek`/`sumSpeakingSeconds`/
  `countCompletedLessons`/`topCorrections`(빈도·정규화 dedupe·동률 안정)/`buildWeeklyReport` +
  저장소 주입 통합 `collectWeeklyReport`(기간 내 세션만 턴 조회하는 N+1 가드).
- **프로필 UI**: "최근 7일" 카드(`WeeklyReportCard` 신규) — 발화 분·완료 레슨·교정 TOP5 빈도·빈 상태.
  `['weekly-report']` TanStack Query + 포커스 invalidate(탭 마운트 유지 대응). 프로필 ScrollView 전환.
- **정직성(ADR-0010 선례)**: 세 지표 모두 클라가 위조 불가한 서버 측 값만 집계. 의도된 한계(레슨 발화는
  최초 완료분만·rolling 7일·교정 턴 started_at 필터)는 ADR-0011 W6 부록에 문서화.
- **검증**: vitest **446**(419→+27, 커버리지 95.61/85.03/98.11/97.79), E2E mock **34/34**(S8 주간 카드)·
  tutor 15/15 회귀. 리뷰 H1(stale 캐시)·M1(ScrollView)·M2(collect 테스트)·L1·L2 반영. 근거: docs/plans/p2-w6-weekly-report.md
- 이월: 레슨 재복습 발화 비정규화·교정 집계 N+1 제거·전주 대비 추세는 Phase 3

## 2026-06-13 (세션 9) — Phase 2 W5b 레슨 히스토리 (일반 ted-run, 커밋 `464557e`)

전략: **W5 튜터 히스토리와 동일한 읽기 패턴을 레슨에 확장** — 스키마 변경 0(기존 RLS select 재사용).

- **레슨 히스토리 읽기**(`progress-repo.ts`): `listSessions`/`getSession`/`getSessionTurns` 추가(Mock+Supabase).
  레슨 RLS(본인 select·세션 소유권 위임)를 재사용해 **신규 RPC·grant 0**. corrections는 방어적 변환(신뢰 경계).
  Mock은 완료 세션을 별도 `history` 맵에 보존(`getOrCreateSession`은 활성만 재개)해 웹/E2E 히스토리 지원.
- **통합 집계**(`history.ts` 신규): 순수 `mergeHistory(tutor, lesson)` — 종류 태깅 후 started_at 내림차순 병합.
- **대화 기록 UI**: 레슨·튜터 세션을 **시간순 통합 목록**(종류 배지 레슨/AI 튜터), 상세는 `?kind=lesson|tutor`로
  저장소 분기(타인 id는 RLS 0행 → null, 튜터와 동일 IDOR 방어). 교정 없는 세션엔 저장 힌트 미노출(리뷰 HIGH).
- **레슨 교정 저장**: `ConversationStep` 선택적 props(`onSaveCorrection`/`isSaved`, 미주입 시 회귀 0) +
  `lesson/[id]`에 `useSaveExpression` 연결(튜터·히스토리 공용 훅, 저장소는 출처 무관).
- **검증**: vitest **419**(400→+19, 커버리지 95.43/84.81/97.89/97.64), E2E tutor 15/15·mock 33/33 회귀.
  ADR-0011 부록. 근거: docs/plans/p2-w5b-lesson-history.md
- 이월: 레슨 완료 점수(user_progress) 카드 노출·레슨 세션 발화시간/턴수 비정규화는 Phase 3, W6 주간 리포트는
  `listSessions()` 통합 집계 재사용

## 2026-06-13 (세션 8) — Phase 2 W5 대화 히스토리 + 표현 저장 (보안 민감 ted-run, 커밋 `40868af`)

전략: **히스토리는 기존 데이터 재사용(스키마 변경 0)**, **표현 저장만 신규 테이블 1개**(ADR-0011).

- **히스토리(튜터)**: `tutor-repo`에 `listSessions`/`getSession`/`getSessionTurns` 읽기 메서드만 추가 —
  기존 본인 select RLS 재사용(신규 RPC·스키마 0). 타인 id(IDOR)는 RLS가 0행 반환.
- **표현 저장**(`saved_expressions` 신규 테이블, 보안 민감): 사용자 소유 노트라 **delete 허용**(W2 불변
  로그와 의도적 차이, 파밍 표면 0), **update 부재**(교정 스냅샷 불변), insert 컬럼 화이트리스트(`id`·
  `created_at` 서버 default 위조 차단), 길이 CHECK + `unique(user_id, original, suggested)`로 dedup·abuse 방어.
- **타입·저장소**: `SavedExpression` zod(`Correction` 재사용·`z.infer`), Mock/Supabase `saved-repo`(23505 idempotent·
  delete), `useSaveExpression` 훅(낙관적+실패 롤백). UI: 프로필 진입 카드 2개, history 목록·상세(턴 재생),
  saved 복습 목록(삭제), 교정 칩 길게 눌러 저장. 신규 화면은 TanStack Query(effect 동기 setState 회피).
- **검증**: vitest **400**(369→+31, 커버리지 95.31/86.04/97.71), E2E tutor 15/15, verify-rls **64/64**(52→+12). ADR-0011

## 2026-06-13 (세션 7) — Phase 2 W4 발음 피드백: 정직한 최소 범위 (일반 ted-run)

전략: **스파이크로 먼저 진실을 측정** — "발음 점수"를 만들기 전에 OpenAI 단독으로 그게 가능한지
실측했다. 결론: 불가. 그래서 가짜 점수 대신 **진실하게 말할 수 있는 것만** Drill에 더했다(ADR-0010).

- **발음 스파이크**(`packages/ai/spike/pronunciation.mts`, `npm run spike:pron`): 같은 기준문을 네이티브·
  한국어 보이스·음소 치환 오류(th→s,v→b,f→p,r→l) 주입으로 합성해 비교. **whisper-1은 음소 오류를
  실단어로 자동교정해 거짓 100점**(ribber→river 등 6개 중 3개 은폐), 억양은 logprob Δ≈0으로 못 구분.
  **gpt-audio(-mini)는 비결정적**(거부/네이티브에 약점 음소 환각/깨진 JSON). gpt-4o-audio-preview는 계정 미접근(404)
- **순수 코어**(`packages/shared/src/pronunciation.ts`): `assessClarity`(avg_logprob→clear/fair/unclear/
  unknown 밴드, 스파이크 임계값 -0.5/-0.62), `assessPronunciation`(**scoreDrill 재사용**+또렷함 — recognized/
  missing 분리·recognitionScore), `PronunciationAssessor`/`localAssessor` seam(Azure 음소평가 드롭인 자리)
- **STT 상세 전사**(`stt.ts`): `transcribeDetailed`(verbose_json→text+segment avg_logprob 평균). 기존
  `transcribe`는 **무변경**(makeTranscribeInit/toBlob 헬퍼만 추출, FormData 재시도-마다-재생성 성질 보존)
- **Drill 연결**: `transcribeUriDetailed` 어댑터, `scoreAndApply`가 `assessPronunciation` 사용·avgLogprob
  전달. UI는 점수 링 라벨을 **"단어 인식"**으로 reframe(발음 등급 오인 방지)+clarity 보조 조언("🎧 또렷하게
  다시")만 노출(점수 아님). 통과 문구 "자연스러워요"→"다 알아들었어요"(발음 정확도 단정 제거). 토큰만 사용
- **리뷰·검증**: 독립 1차 리뷰 PASS(MEDIUM 1 정리 — clarityHint 이중 호출 캐시, LOW 2는 기존 패턴 답습
  기록만). vitest **369**(353→+16, 커버리지 94.97/87.96/97.32), E2E mock-flow 33/33(드릴 동선 무변경 회귀). ADR-0010
- 이월: 진짜 음소·강세·억양 평가는 Azure Speech 도입 시 `PronunciationAssessor`에 드롭인 +
  `pronunciation_attempts` 테이블(보안 민감). clarity는 약한·복합 신호라 점수화 안 함

## 2026-06-13 (세션 6) — Phase 2 W3 롤플레이 (일반 ted-run)

전략: **W2 재사용 극대화** — 롤플레이(레스토랑·공항·면접·호텔)를 새 테이블·전송 없이 프리토킹 seam
위에 얹는다. scenario id를 `tutor_sessions.topic`에 저장, 일일 캡·세션 cap 공유. 스키마 변경 없음 →
보안 민감 아님(ADR-0009).

- **콘텐츠 스키마**(`content-schema.ts`, zod 단일 출처): `RoleplayScenarioSchema`(역할·목표·성공 기준 ·
  objectives 2~4 · CEFR · objective id 고유 refine) + `RoleplayCollectionSchema`(scenario id 고유). 시드
  4종 `content/roleplay/scenarios.json`, `content/index.ts`에서 로드 시 검증 + `findScenario`. `validate:content` 통과
- **코어 목표 추적**(`tutor-core.ts`, 순수, additive): `createTutorState(topic, objectives?)`,
  `applyTedTurn`에 `metObjectiveIds` 머지(**시나리오에 존재하는 id만 채택·중복 제거 — 신뢰 경계**),
  `summarizeTutor`가 `goal{total,met,achieved,checklist}` 반환(프리토킹은 `goal:null` — 회귀 보존)
- **전송**(`tutor-transport.ts`): `TutorReply.metObjectiveIds` 계약 + `createRoleplayMockTransport`(턴마다
  objective 순서대로 1개씩 결정적 신호, 텍스트 미리보기·폴백 공유). 라이브 판정은 모델(이월, 같은 seam)
- **UI**(`(tabs)/tutor.tsx`): 주제 선택에 롤플레이 섹션(배역 배지·상황), 세션에 목표 체크리스트·
  openingLine 첫 버블·배역 안내, 요약에 목표 달성 판정 카드(달성 시 mint). 토큰만 사용(인라인 hex 없음)
- **리뷰·검증**: 독립 1차 리뷰 PASS(LOW 2 정리 — 머지 Set화·override 테스트). vitest 353(커버리지
  94.7/87.3/97.2), E2E tutor 10/10(프리토킹 회귀 6 + 롤플레이 4: 시나리오→목표 3/3→판정). ADR-0009
- 이월: 라이브 음성 도입 시 목표 판정을 모델 신호로 전환(seam 계약 `metObjectiveIds` 기정의), 통계
  분리 필요 시 `tutor_sessions.kind` 도입(보안 민감)

## 2026-06-13 (세션 5) — Phase 2 W2 프리토킹 기반 (보안 민감 ted-run) `59cfb74`

전략: **기반부터** — Expo Go에서 완결 가능한 토대(스키마/RLS·세션 로직·UI)를 전송 인터페이스 뒤에
구현. 라이브 Realtime WebRTC 전송·실기기 검증은 dev build 후속으로 이월(ADR-0008).

- **스키마/RLS**: `tutor_sessions`/`tutor_turns`(lesson 패턴 미러 — 본인 행만·세션 삭제 불가·턴 불변 로그).
  **안티-파밍**: `revoke insert,update` + `grant insert(user_id,topic)`만, 완료는 `complete_tutor_session`
  SECURITY DEFINER RPC로만(duration_seconds를 서버가 `now()-started_at`로 산정 — 클라 위조 차단).
  일일 캡은 완료 duration + 진행 중 경과시간(미완료 우회 차단)을 합산. RLS 52케이스(튜터 16 추가)
- **세션 상태머신**(`tutor-core.ts`, 순수): topic→connecting→active→ending→summary, 5분 세션 cap·턴당
  30초·히스토리 6턴 윈도우·교정 집계 요약. **저장소/캡**(`tutor-repo.ts`): mock/supabase + 일일 캡(5분/일)
- **전송 계층**(`tutor-transport.ts`): `TutorTransport` 인터페이스 + `MockTutorTransport`(결정적, 텍스트
  미리보기·테스트) + `RealtimeTutorTransport` 이월 스텁(dev build 필요). **UI**(`(tabs)/tutor.tsx`):
  주제 선택→세션→요약, 일일 캡 잠금, 텍스트 폴백
- **이중 리뷰**: 2a 품질(언마운트 정리·더블탭 가드 수정), 2b 적대적 보안(캡 위조 HIGH 수정·재리뷰 통과)
- **검증**: vitest 327개(커버리지 94.3/86.4/96.9), RLS 52/52, E2E tutor 플로우 6/6(주제→세션→요약). ADR-0008
- 이월(후속, dev build 전제): 라이브 WebRTC 전송·실마이크 스트리밍·실기기 5분 완주·시나리오별 비용 재측정

## 2026-06-13 (세션 4) — P1.5 다듬기 + Phase 2 W1 Realtime 스파이크

### P1.5 다듬기: 재로그인 하이드레이트 + reply clamp (보안 민감 ted-run) `3f90b77`

- V1: supabase 실로그인 시 profiles 1회 재조회 하이드레이트 — `profiles.onboarded_at` 마커(신규 마이그레이션) + `lib/profile-sync.ts`(auth 스토어 구독, require cycle 방지). 로그아웃→재로그인 시 온보딩 스킵·홈 직행, 서버 streak 반영. `profileToHydration` 방어 검증(enum 밖→null, 범위 밖→기본값/0, 날짜 형식 검증), 권위 출처 구분(streak·last_study_date는 서버 트리거)
- V2: `TurnFeedback.reply` 문장 경계 clamp(`MAX_REPLY_CHARS=400`) — 스키마 `.max()` 하드 실패 대신 회복형 절단(Fallback 원칙), TTS 비용·재생 시간 상한
- 보안(2a MEDIUM 4·LOW 3 + 2b HIGH 1·MEDIUM 1 수정·재리뷰 PASS): in-flight 크로스유저 PII 주입 차단(스테일 응답 폐기), 리스너 경유 로그아웃 PII 정리(재수화 역전 가드), `login.tsx` imperative→반응형 라우팅(스테일 onboarded 우회 해소), `LEARNING_GOALS` 단일 출처화 — semgrep 신규 0건, **RLS 36/36**(onboarded_at 케이스 3 추가)
- 검증: 테스트 272개(커버리지 93.4/86.1/96.5%), E2E supabase-flow 13 PASS(재로그인 온보딩 스킵·DB 반영·PII 정리 신규 S12 포함)
- 문서: ADR-0006(하이드레이트·신뢰 경계·clamp), 실기기 검증 체크리스트, U11 OAuth 준비 문서, Phase 2 계획서 초안 (ADR-0005 §한계 2건 해소 포인터)

### Phase 2 W1 Realtime 스파이크 + 실측 → ADR-0007 승인 `add6d52` (세션 5 커밋)

- `packages/ai/spike/realtime.mts` — OpenAI Realtime WebSocket 1세션 E2E. 입력은 TTS pcm(24kHz=Realtime 입력 포맷) 자가 합성, 첫 응답 지연(commit→첫 오디오)·barge-in(response.cancel 확정)·턴당 비용(usage×단가)을 3회 중앙값 측정. preview↔GA 스키마·이벤트명 차이 견고 흡수, 모델은 `REALTIME_MODEL` 오버라이드
- `ws`/`@types/ws`를 `@ted-speak/ai` devDependency로 선언, `spike:realtime` 스크립트 추가
- **실측(2026-06-13, gpt-realtime GA)**: 첫 응답 지연 중앙값 **0.63s**(turn-based 3.51s 대비 ~5.6×), barge-in 취소 확정 **175ms**, 턴당 **~$0.006–0.010**(~$0.035–0.063/분). 실측 중 스파이크 버그 3건 수정 — ① `session.update` 미전송 ② GA `session.type:'realtime'` 필수 ③ 서버 VAD 미해제 시 `turn_detected` 자동 취소로 가짜 측정값(0.04s·usage 0·빈 응답) → `audio.input.turn_detection:null` + 이중 검증. 첫 오디오 델타에서 transcript 제외, barge-in은 최종 `response.done` 기준
- **ADR-0007 승인**: AI 튜터(프리토킹·롤플레이) Realtime 채택, 레슨 turn-based 유지(Hybrid 확정). 비용은 일일 시간 상한·세션 길이 cap으로 통제(W2). 실행: `OPENAI_API_KEY=... npm run spike:realtime -w @ted-speak/ai`

## 2026-06-12~13 (세션 3) — P1 핵심 루프 U1~U9 (보안 민감 ted-run) `6489099`

- U1: `reliableFetch` 신뢰성 계층 — 시도당 타임아웃 15s + 지수 백오프 재시도 2회, 호출자 signal 취소, 스트림 첫 바이트 전만 재시도 (undici 스톨 대응, ADR-0003 갱신)
- U2~U7: 레슨 3단계 풀 루프 — recorder-core(30초 cap·권한 폴백) → Drill 로컬 채점(2회 실패 후 건너뛰기) → 4턴 대화(교정 칩, Ted 발화 문장 분할 합성 재생) → 완료 요약·XP. lesson-core 순수 상태 머신 + lesson_sessions.snapshot 이어하기(신규 마이그레이션) + 일 1레슨 소프트 제한 (ADR-0005)
- U3/U8: 온보딩 4단계(profiles 화이트리스트 컬럼만 동기화), 이메일 로그인/가입 + Dev Mock UI 게이트
- U9: 일상 회화 6레슨, content JSON → seed.sql 생성기(`npm run generate:seed`) 단일 출처화
- 보안(2a 3건+2b 1건 MEDIUM 수정·재리뷰 PASS): 완료 이중 보상 차단(순서 보장+23505 멱등), 로그아웃 로컬 PII 정리, mock 저장소 user 네임스페이스, AI 키 dev 전용 가드 — semgrep 0건, RLS 33/33
- 검증: 테스트 228개(커버리지 96.1/84.8/96.4%), E2E 웹 Playwright 35 PASS(mock 풀루프 + supabase 가입→온보딩→DB 반영)
- 잔여: 실기기 검증(턴 지연 ≤4s 측정·음성 완주 — 사용자 액션), U11 OAuth 보류

## 2026-06-12 (세션 2) — T2 완결 + T4 Supabase (보안 민감 ted-run) `6cc31f1`

- T2: 짧은 발화 벤치마크(`spike/bench.mts`) — 현행 모델+TTS 스트리밍 중앙값 3.51s ✅, gpt-4o-mini 조합 기각 (ADR-0003 갱신)
- T4: 로컬 Supabase(Docker, 포트 553xx) — 스키마+RLS 마이그레이션, 시드, supabase-js 클라이언트, Dev Mock Auth(프로덕션 가드 포함)
- 보안(2b 적대적 리뷰 + 1차 리뷰 교차): is_premium·streak·발화시간 위조 차단(컬럼 grant), 통계 서버 트리거 전환, **PK 셔플 farming 우회 차단**, 대화 턴 불변 로그, KST streak 경계 — RLS 공격 시나리오 33케이스 검증(`scripts/verify-rls.mts`)
- ADR-0004(데이터 계층 — Prisma 제외·RLS 모델·CVE 예외), Phase 1 작업계획서(`docs/plans/p1-core-loop.md`)
- 테스트 45개·커버리지 99/92/100%, E2E(웹 export, supabase 클라이언트 포함 번들) 통과

## 2026-06-12 (세션 1) — Phase 0 킥오프 + Foundation 1차 ted-run `aab4a3b`~`72fd933`

- HTML 프로토타입(`prototype/index.html`) — 온보딩→홈→레슨 3단계→완료→튜터/프로필 전 동선 클릭 검증, TTS 실동작
- AI 스파이크: Whisper→GPT-4o→TTS 1턴 E2E 검증 (v1 순차 5.4~5.9s)
- Expo 모노레포 스캐폴딩: apps/mobile(SDK 56, Expo Router IA) + packages/shared(토큰·타입) + packages/ai + content 시드 1레슨
- `docs/plans/p0-foundation.md` 작성, `/ted-run` 1차 실행 (T1·T2·T5·T6·T7):
  - T1: `packages/ai` 모듈화 (stt/tutor/tts, 키 주입식, 테스트 33개·커버리지 98.8%)
  - T2: TTS 스트리밍 재생 + max_tokens cap + 로컬 drill 채점 — 체감 지연 중앙값 4.22s (목표 ≤4s 근접, 미완)
  - T5: zod 콘텐츠 스키마 + 홈 화면 콘텐츠 로딩 (E2E 스크린샷 검증)
  - T6: ADR-0001 스타일링(StyleSheet+토큰), ADR-0002 expo-audio, ADR-0003 지연 전략
  - T7: `npm run ci` + GitHub Actions 워크플로
- 이중 리뷰 반영: 스트림 리더 누수, 스키마 이중 정의 해소(z.infer 단일 출처), 커버리지 병합 버그(워크스페이스 심링크) 등 9건 수정
