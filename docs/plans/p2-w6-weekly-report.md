# P2 W6 — 주간 스피킹 리포트 작업계획서

> Ted Speak (TalkTed) Phase 2 W6 | 2026-06-13 작성 (세션 10)
> 근거: docs/plans/p2-tutor.md §2 W6, PLAN.md §4.3 / 파이프라인: /ted-run
> 전략: **W5/W5b의 "기존 select RLS 재사용 + 순수 집계" 패턴을 한 번 더 연장.** 스키마 변경 0·신규 RPC 0.

---

## 1. 목표·범위

프로필 탭에 **주간 스피킹 리포트 카드**를 얹는다 — 최근 7일 ① 발화 시간 ② 완료 레슨 수 ③ 교정 TOP5.
모두 **이미 적재된 서버 산정 데이터**를 클라이언트에서 집계한다(스키마 변경·신규 RPC·신규 테이블 없음).

### 정직성 원칙 (ADR-0010 선례 — 가짜 지표 출시 안 함)

세 지표 모두 **위조 불가능한 서버 측 값**만 사용한다:

- **발화 시간** = 레슨(`user_progress.speaking_seconds`, 완료 시 서버가 적재·불변) + 튜터
  (`tutor_sessions.duration_seconds`, `complete_tutor_session` RPC가 `now()-started_at`로 산정).
  클라이언트가 부풀릴 수 없는 값만 합산한다. 진행 중 튜터 세션은 제외(완료분만 — 캡 산정과 달리
  리포트는 확정된 발화만 센다).
- **완료 레슨 수** = `user_progress` 행 수(`completed_at`이 기간 내). PK가 `(user_id, lesson_id)`라
  레슨당 1행·`completed_at`은 최초 완료 시각(불변) → "이번 주 새로 완료한 레슨"으로 정확히 해석된다.
- **교정 TOP5** = 기간 내 세션의 대화 턴(`conversation_turns`/`tutor_turns`)에 적재된 `corrections`를
  빈도순 집계. 사용자가 실제로 받은 교정만 — 합성·추정 없음.

### 기간 정의 — 최근 7일(rolling)

캘린더 주(월~일)는 매주 월요일 카드가 비어 UX가 나쁘다. **rolling 7일**(`now - 7d`)로 항상 최근 활동을
보여준다. 라벨은 정직하게 **"최근 7일"**. 순수 함수에 `now`를 주입해 결정적으로 테스트한다.

### 범위 결정(정직한 최소)

- **레슨 발화 시간은 최초 완료분만 집계된다**(데이터 모델 한계). `user_progress`는 레슨당 1행이라
  재복습 발화는 어디에도 세션 단위로 적재되지 않는다. 튜터는 매 세션 `duration_seconds`가 남아 전량 집계.
  이 비대칭은 정직하게 문서화하고, 카드는 "레슨/튜터 합산 발화"로만 표기(분리 노출 안 함).
- **교정 TOP5는 기간 내 세션별 턴 조회(N+1)**. 일 1레슨 소프트 제한 + 튜터 캡으로 주간 세션 수가
  적어 허용 범위. TanStack Query로 1회 캐시. 비정규화 집계는 후속 이월.
- **차트·추세·전주 대비 없음**(Phase 3). 단일 주간 스냅샷 카드만.
- **Mock(웹/E2E) 패리티**: 현재 Mock `recordProgress`는 `lessonId → 날짜문자열`만 저장(발화시간 유실).
  `{ completedAt, speakingSeconds, score }` 레코드로 확장하고 **first-write-wins**(서버 PK 불변 패리티).
  구 문자열 포맷은 `load()`에서 방어적으로 정규화(웹은 메모리 폴백이라 PII 영속 표면 작음).

### 보안

- 읽기 전용 확장 — 신규 grant·정책·테이블 없음. `user_progress`/`*_turns`는 본인 select RLS가 이미 열림.
  타인 데이터(IDOR)는 RLS가 0행(신뢰 경계).
- transcript 등 PII는 계속 비로깅. 교정 집계는 클라 메모리 내에서만 수행.
- 발화 시간·완료 수·교정 모두 서버 측 불변값 → farming 표면 0(클라 집계지만 원천이 위조 불가).

---

## 2. 작업 목록

### W6-1. 저장소(주간 진행 읽기) — `apps/mobile/src/lib/progress-repo.ts` (vitest)

기존 `ProgressRepo`에 **읽기 메서드 1개 + Mock 진행 모델 확장**(쓰기 grant·스키마 무변경):

- 타입 `ProgressRecord`: `{ lessonId: string; completedAt: string(ISO); speakingSeconds: number; score: number | null }`.
- 메서드 `listProgress(): Promise<ProgressRecord[]>` — 본인 `user_progress` 전체.
  - Supabase: `from('user_progress').select('lesson_id, completed_at, speaking_seconds, score')`
    (기존 "본인 진행도 조회" select RLS 재사용, user_id 필터 불필요). 방어적 숫자/문자 변환.
  - Mock: `state.progress` 엔트리를 레코드로 매핑.
- **Mock 진행 모델 확장**(웹/E2E·오프라인 패리티):
  - `state.progress` 값을 `string`(날짜) → `{ completedAt: string(ISO); speakingSeconds: number; score: number }`로.
  - `recordProgress`: **first-write-wins** — 이미 있으면 덮어쓰지 않음(서버 PK 불변·트리거 1회 누적 패리티).
  - `getCompletedLessonIds`: 키 그대로(무변경). `isLessonCompletedToday`: 레코드 `completedAt`의 KST 날짜로 판정
    (기존 동작 유지 — 최초 완료가 오늘이면 today). 구 문자열 포맷은 `load()`에서 정규화.
- **완료**: progress-repo.test.ts — `listProgress` 반환 형태·정규화, first-write-wins(재호출 시 최초값 보존),
  구 포맷 마이그레이션, Fake Supabase select 형태. 기존 테스트(getCompletedLessonIds·isLessonCompletedToday) 회귀 무변경.

### W6-2. 주간 집계(순수 헬퍼) — `apps/mobile/src/lib/weekly-report.ts` (신규, vitest)

저장소 의존 없는 순수 함수만(단위 테스트 용이, `history.ts` 패턴 미러):

- 타입:
  - `CorrectionCount`: `{ original: string; suggested: string; type: Correction['type']; count: number }`.
  - `WeeklyReport`: `{ speakingSeconds: number; completedLessons: number; topCorrections: CorrectionCount[] }`.
- `WEEK_MS = 7 * 24 * 60 * 60 * 1000`. `weekStartMs(now: Date): number = now.getTime() - WEEK_MS`.
- `isWithinWeek(iso: string, now: Date): boolean` — `completedAt`/`startedAt`이 기간 내(파싱 실패는 false).
- `sumSpeakingSeconds(progress: ProgressRecord[], tutor: TutorSessionSummary[], now: Date): number`
  — 레슨: `completedAt` 기간 내 `speakingSeconds` 합. 튜터: `status==='completed'` && `startedAt` 기간 내 `durationSeconds` 합.
- `countCompletedLessons(progress: ProgressRecord[], now: Date): number` — `completedAt` 기간 내 행 수.
- `topCorrections(corrections: Correction[], limit = 5): CorrectionCount[]`
  — 정규화 키(`original.trim().toLowerCase() + '→' + suggested.trim().toLowerCase()`)로 빈도 집계,
    `count desc` 정렬(동률은 첫 등장 순서 안정 유지), 상위 `limit`. 대표 표기는 첫 등장의 원문 casing/type.
- `buildWeeklyReport({ progress, tutor, corrections, now }): WeeklyReport` — 위 셋을 조립.
- **완료**: weekly-report.test.ts — 기간 경계(7일 직전/직후), 발화 합산(레슨+튜터·진행중 튜터 제외),
  완료 수, 교정 빈도·동률 안정·정규화 dedupe·limit, 빈 입력. `vitest.config.ts` coverage.include에 `weekly-report.ts` 등록.

### W6-3. UI — 프로필 주간 카드

- **데이터 훅** `apps/mobile/src/lib/use-weekly-report.ts`(또는 profile 내 useQuery, `history/index.tsx` 패턴):
  - `queryKey: ['weekly-report']`. queryFn:
    1. `progressRepo.listProgress()` + `tutorRepo.listSessions()` 동시 로드(`Promise.all`).
    2. 기간 내 세션(레슨 `listSessions` + 튜터) id 선별 → 각 `getSessionTurns`로 corrections 수집(N+1, 기간 한정).
    3. `buildWeeklyReport({ progress, tutor, corrections, now: new Date() })`.
  - repo가 null(미로그인/미초기화)이면 빈 배열 → 빈 리포트. 에러는 카드 숨김 또는 안내(부가 정보).
- **카드** `apps/mobile/src/app/(tabs)/profile.tsx`(또는 분리 컴포넌트 `components/profile/WeeklyReportCard.tsx`):
  - `statRow` 아래, `infoBox` 위에 삽입. 헤더 "최근 7일".
  - 발화 시간(분), 완료 레슨 수 → 기존 `Stat` 스타일 재사용 가능.
  - 교정 TOP5 → `original → suggested` + 빈도 배지 리스트. 0건이면 "이번 주 교정이 아직 없어요" 빈 상태.
  - StyleSheet + `@ted-speak/shared` 토큰만(인라인 hex 금지).
- **완료**: Expo Go — 레슨·튜터 후 프로필 카드에 최근 7일 발화·완료·교정 TOP5 표시, 활동 없으면 빈 상태.

### W6-4. 검증·문서

- `npm run ci` 그린(커버리지 게이트 80). 신규 `weekly-report.ts` coverage.include 등록 확인.
- 기존 vitest·E2E(튜터 15/15, mock-flow 33) 회귀 무변경. `listProgress`·Mock 모델 변경이
  기존 progress 경로(완료·오늘판정·히스토리)를 깨지 않는지 확인. verify-rls는 스키마 무변경이라 케이스 추가 없음.
- E2E(선택): mock-flow에 "레슨 완료 → 프로필 주간 카드 발화/완료 반영" 1케이스.
- 문서: 이 작업계획서, p2-tutor.md §2 W6 완료 표기·§4 완료 정의 체크, HANDOFF 갱신.
  ADR: 패턴 동일(기존 RLS 재사용)이라 신규 ADR 불필요 — 정직성 원칙(레슨 발화 비대칭·rolling 7일)은
  ADR-0011에 W6 부록 한 줄 또는 이 계획서로 충분.

---

## 3. 순서·의존성

```
W6-1(진행 읽기 저장소) ─┐
W6-2(주간 집계 순수)   ─┼─→ W6-3(UI 카드) ─→ W6-4(검증·문서)
                        └ W6-3은 W6-1·W6-2 + 기존 listSessions/getSessionTurns(W5b) 의존
```

## 4. 완료 정의

- [ ] `ProgressRepo.listProgress` + Mock 진행 모델 확장(first-write-wins·구포맷 정규화) + 테스트, 기존 경로 회귀 0
- [ ] `weekly-report.ts` 순수 집계(발화 합산·완료 수·교정 TOP5 빈도) + 테스트(경계·동률·dedupe)
- [ ] 프로필 "최근 7일" 카드(발화 분·완료 레슨·교정 TOP5·빈 상태), 토큰만 사용
- [ ] `npm run ci` 그린, 기존 vitest·E2E 회귀 무변경, 주간 카드 E2E(선택)
- [ ] 문서 갱신(작업계획서·p2-tutor §2/§4·HANDOFF)

## 5. 이월(후속)

- 레슨 재복습 발화 시간 집계 — 세션 단위 발화 비정규화 필요(보안 민감 스키마 변경), Phase 3.
- 교정 집계 비정규화(N+1 제거) — 완료 시 교정 카운트 적재 컬럼/뷰, 활동량 증가 시.
- 전주 대비·추세 차트·streak 연동 — Phase 3 학습 정착과 함께.
