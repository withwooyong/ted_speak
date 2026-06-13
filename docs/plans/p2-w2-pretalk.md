# P2 W2 — 프리토킹 (기반부터) 작업계획서

> Ted Speak (TalkTed) Phase 2 W2 | 2026-06-13 작성 (세션 5)
> 근거: docs/plans/p2-tutor.md W2, ADR-0007(Realtime 승인) | 파이프라인: /ted-run (보안 민감)
> 전략: **기반부터** — Expo Go에서 테스트 가능한 토대(스키마/RLS + 코어 로직 + UI)를 전송
> 인터페이스 뒤에 TDD로 구현. 라이브 Realtime 전송 + 실기기 검증은 dev build 후속(별도 세션).

---

## 1. 목표·범위

레슨 루프(P1) 옆에 **프리토킹(자유 대화)** 탭을 처음 연다. 이번 W2 기반 단위는 **디바이스 없이
완결 가능한 부분**까지: 세션 데이터 모델·보안, 세션 상태머신·캡 로직, tutor 탭 UI(주제→세션→요약)를
**전송 인터페이스(`TutorTransport`) 뒤에** 만든다. UI·코어는 `MockTutorTransport`로 E2E 데모·테스트한다.

**이번 W2에서 하지 않는 것(후속 — dev build 필요)**: 라이브 Realtime WebRTC/WS 전송 구현, 실마이크
연속 캡처·스트리밍 재생, 실기기 5분 프리토킹 검증. → ADR-0008에 전송 결정·이월 사유 기록.

레슨 패턴 재사용: `lesson-core.ts`(순수 상태머신) · `lesson_sessions`/`conversation_turns`(스키마·RLS)
· `progress-repo.ts`(Supabase CRUD + 목 테스트) · 소프트 제한(home.tsx `completedToday` 클라 게이트).

## 2. 작업 목록

### W2-1. 스키마 + RLS (보안 민감) — `supabase/migrations/20260613100000_tutor_sessions.sql`

- `tutor_sessions`: id uuid pk, user_id(fk auth.users, cascade), topic text, status check
  ('in_progress'|'completed'|'aborted'), started_at, ended_at, duration_seconds int
  check(between 0 and 3600 — 발화시간 부풀리기 1차 방어, user_progress 패턴), turn_count int, summary jsonb.
- `tutor_turns`: id, session_id(fk tutor_sessions cascade), "order" int, role check('user'|'assistant'),
  transcript text, corrections jsonb default '[]', created_at, unique(session_id,"order").
- RLS: `lesson_sessions`/`conversation_turns` 그대로 미러 — 본인 행만 select/insert/update,
  **delete 정책 없음**(불변 로그 cascade 우회 삭제 차단), 턴은 update/delete 미허용(불변), 소유권은
  세션 위임(exists 서브쿼리).
- **stat 트리거 없음**: tutor duration_seconds는 `profiles.total_speaking_seconds`에 **누적하지 않는다**
  (farming 표면 회피 — 라이브 시간 위조 방지 어려움). 주간 리포트(W6)는 클라이언트 집계. ADR-0008에 명시.
- **완료**: `supabase db reset` 통과, `npx tsx scripts/verify-rls.mts` 신규 케이스 추가
  (본인 insert/select/update 허용 · 타인 차단 · 타인 세션에 턴 주입 차단 · 턴 update/delete 차단 ·
  duration_seconds 범위 위반 거부). 기존 36 + 신규 → 케이스 수 갱신.

### W2-2. 세션 상태머신 (순수) — `apps/mobile/src/lib/tutor-core.ts` (vitest)

- `TutorPhase = 'topic' | 'connecting' | 'active' | 'ending' | 'summary'`.
- `TutorState`: phase, topic, turnCount, corrections[], speakingSeconds, elapsedSeconds,
  history(최근 6턴 슬라이딩 — 모델 전송용 {role,text}), endedReason('time_up'|'user_ended'|'error'|'daily_cap').
- 상수: `SESSION_MAX_SECONDS=300`(5분), `TURN_MAX_SECONDS=30`, `HISTORY_WINDOW=6`(레슨과 동일 제약).
- 전이(불변, RN 의존 0): `createTutorState(topic)` · `markConnecting` · `markActive` ·
  `applyUserTurn({transcript,seconds})`(speaking·sentences 누적, history push+윈도우 트림, 30s 캡 클램프) ·
  `applyTedTurn({corrections,reply})`(corrections 누적, history push) · `tick(elapsedSeconds)`
  (≥SESSION_MAX → ending, endedReason='time_up') · `endSession(reason)` → summary.
- `summarizeTutor(state)`: corrections type별 집계(레슨 `IMPROVEMENT_LABEL` 재사용 검토 — shared로 승격
  or 복제), 발화시간·턴수·strengths/improvements(최대 2). 교정 타입은 `@ted-speak/shared` `Correction`.
- **완료**: 전이·캡·윈도우·요약 단위 테스트(경계: 정확히 300s, 6턴 초과 트림, 30s 초과 클램프, 교정 0건).

### W2-3. 일일 캡 + 세션 저장소 — `apps/mobile/src/lib/tutor-repo.ts` (vitest, 목)

- `progress-repo.ts` 패턴: Supabase CRUD 래퍼 + 주입 가능한 클라이언트로 목 테스트.
  `createTutorSession(topic)` · `appendTutorTurn(sessionId, turn)` · `completeTutorSession(id, summary, duration)` ·
  `listTodaySessions(userId)`(KST 경계 — init.sql 트리거의 `Asia/Seoul` 기준과 일치).
- 일일 캡: `DAILY_CAP_SECONDS=300`(소프트, MVP 5분/일 — ADR-0007 비용 통제). `remainingDailyCap(usedToday)`
  순수 헬퍼. 캡 소진 시 phase='topic'에서 시작 차단(home.tsx `completedToday` 게이트와 동형).
- **완료**: CRUD·집계·캡 헬퍼 목 테스트(오늘/어제 경계 KST, 캡 정확히 소진, 음수 클램프).

### W2-4. 전송 인터페이스 + 목 — `apps/mobile/src/lib/tutor-transport.ts` (vitest)

- `interface TutorTransport`: `connect()` · `sendUserText(text)` 또는 `sendUserAudio` · `bargeIn()` ·
  `close()` + 콜백/이벤트(`onConnected`, `onTedReply({reply,corrections})`, `onError`). 코어가 구동.
- `MockTutorTransport`: 결정적 — 주제별 스크립트 Ted 응답 + 가짜 corrections 1~2건, 지연 시뮬. UI·코어를
  디바이스 없이 E2E 구동·테스트. 텍스트 입력 폴백(마이크/네트워크 부재 시 — ADR-0005 Fallback 원칙)도 이 경로.
- `RealtimeTutorTransport`: **이월 스텁** — 명확한 "dev build 필요" 에러/TODO만. 실제 WebRTC/WS·mic
  스트리밍은 후속. W1 스파이크(realtime.mts)가 전송 프로토콜 레퍼런스.
- **완료**: MockTutorTransport가 코어와 결합해 1세션(주제→3턴→요약) 결정적 통과.

### W2-5. tutor 탭 UI — `apps/mobile/src/app/(tabs)/tutor.tsx` (+ 필요 시 하위 컴포넌트)

- 스텁 교체. 3화면 흐름(단일 라우트 내 phase 분기): ① 주제 선택(시드 주제 3~4) → ② 세션
  (타이머/남은시간, 마이크·Ted 상태, barge-in 버튼, 라이브 교정 칩, 일일 캡 소진 시 잠금 카드) →
  ③ 요약(발화시간·턴수·교정·저장 CTA 자리표시 — 저장은 W5).
- StyleSheet + `@ted-speak/shared` 토큰만(인라인 hex 금지). tutor-core + MockTutorTransport 결선.
- 라이브 전송 부재 안내 배너("실시간 음성은 곧 — 지금은 텍스트로 미리보기") + 텍스트 입력 모드로 데모.
- **완료**: Expo Go에서 주제→세션→요약 동선 동작(목 전송), 일일 캡 잠금 노출.

### W2-6. ADR-0008 (RN Realtime 전송 + 이월 결정) — `docs/adr/ADR-0008-rn-realtime-transport.md`

- 결정: 라이브 전송 타깃은 **WebRTC**(`react-native-webrtc`, OpenAI 권장 클라 경로) — dev build 필요.
  W2는 `TutorTransport` 심(seam) 뒤에 구현, Mock으로 검증, 라이브 구현·실기기는 후속.
- 대안: WebSocket + expo-audio PCM 스트리밍(저수준 연속 캡처 제약). 근거·Expo Go 제약·비용 캡 통합·
  tutor duration이 profiles 통계에 안 들어가는 이유(farming) 기록.

### W2-7. 검증·등록

- `vitest.config.ts` coverage.include에 신규 순수 모듈 등록(tutor-core·tutor-repo·tutor-transport).
- E2E(선택): `e2e/tutor-flow.spec.mjs` — web에서 주제→목 세션→요약. (스크린샷·results gitignore)
- `npm run ci` 그린(커버리지 게이트 80 유지), verify-rls 신규 케이스 통과.

## 3. 순서·의존성

```
W2-1(스키마/RLS) ─┐
W2-2(코어) ───────┼─→ W2-3(repo/캡) → W2-4(전송 목) → W2-5(UI) → W2-7(검증)
W2-6(ADR) 병행                                  ↑ W2-5는 2·3·4 의존
```
권장: W2-2 ∥ W2-1 → W2-4 → W2-3 → W2-5 → W2-6 → W2-7

## 4. 완료 정의

- [ ] tutor_sessions/tutor_turns 스키마+RLS, verify-rls 신규 케이스 통과(보안 민감 이중 리뷰)
- [ ] tutor-core 상태머신·캡·요약 단위 테스트 그린
- [ ] 일일 캡·세션 길이 cap 동작(목으로 검증) — ADR-0007 비용 통제 반영
- [ ] tutor 탭 주제→세션→요약 동선 Expo Go 동작(목 전송 + 텍스트 폴백)
- [ ] ADR-0008(전송 결정·이월) 기록
- [ ] `npm run ci` 그린, 신규 순수 모듈 커버리지 등록

## 5. 이월(후속 세션, dev build 전제)

- 라이브 `RealtimeTutorTransport`(WebRTC) 구현 + EAS dev build + react-native-webrtc config plugin
- 실마이크 연속 캡처·스트리밍 재생, 서버 VAD on + 클라 barge-in 실동작
- 실기기 5분 프리토킹 완주 검증, 시나리오별 토큰 프로파일 재측정 → ADR-0007 분당 비용 갱신
