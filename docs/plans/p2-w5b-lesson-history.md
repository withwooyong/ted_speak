# P2 W5b — 레슨 세션 히스토리 + 레슨 교정 저장 작업계획서

> Ted Speak (TalkTed) Phase 2 W5 후속 | 2026-06-13 작성 (세션 9)
> 근거: docs/plans/p2-w5-history.md §5(이월), ADR-0011 | 파이프라인: /ted-run
> 전략: **W5 튜터 히스토리와 동일한 읽기 패턴을 레슨에 확장**. 스키마 변경 0(레슨 RLS select 이미 열림).

---

## 1. 목표·범위

W5는 히스토리를 **튜터 세션만** 다뤘다(정직한 최소). 후속으로 **레슨 세션**을 같은 읽기 경로로
대화 기록에 합치고, **레슨 대화 교정**도 튜터와 동일하게 길게 눌러 저장할 수 있게 한다.

`lesson_sessions`/`conversation_turns`는 init.sql에서 이미 **본인 select RLS**가 열려 있다
(세션은 `user_id`, 턴은 세션 소유권 위임) → **신규 테이블·RPC·스키마 변경 없음**. 저장소에 읽기 메서드만
추가하면 히스토리가 된다(ADR-0011 패턴 그대로). 표현 저장도 저장소가 이미 출처 무관(W5)이므로
`useSaveExpression` 훅을 레슨 대화 UI에 연결만 하면 된다.

### 범위 결정(정직한 최소)

- **대화 기록 = 통합 목록(시간순).** 레슨·튜터 세션을 한 목록에 `started_at` 최신순으로 섞고, 카드마다
  종류 배지(레슨/AI 튜터). 상세는 `?kind=lesson|tutor`로 라우팅해 해당 저장소에서 읽는다.
- **레슨 목록 메타는 최소.** 레슨 세션 행에는 발화시간·턴수가 비정규화돼 있지 않다(튜터는 완료 RPC가
  `duration_seconds`/`turn_count`를 적재). 레슨 카드는 **제목 + 날짜 + 상태(완료/진행 중)**만 — 턴수를
  목록에서 세려면 세션별 count 쿼리(N+1)라 비용 대비 가치 낮음. 상세에서 전체 턴 재생.
- **레슨 교정 저장은 라이브 대화(ConversationStep) + 히스토리 상세 공용.** 튜터와 같은 훅·동선.
- **편집·SRS·점수 조인 없음**(Phase 3). 완료 점수(user_progress) 조인은 이월.
- **Mock(웹/E2E) 보존 필요**: 현재 Mock `completeSession`은 활성 세션을 삭제하고 `startedAt`을 저장하지
  않는다 → 완료 레슨이 히스토리에 안 보인다. Mock을 튜터 Mock처럼 **완료 세션 보존 + 시작시각 저장**으로
  최소 확장(웹은 메모리 폴백이라 PII 영속 표면 작음). Supabase 모드는 행이 그대로 남아 무변경.

### 보안

- 읽기 전용 확장 — 신규 grant·정책 없음. 타인 세션 id(IDOR)는 기존 RLS가 0행 반환(신뢰 경계).
- transcript 등 PII는 계속 비로깅. 레슨 턴은 불변 로그(update/delete 정책 부재) 그대로.
- 저장 표현은 W5 `saved_expressions`(delete 허용·update 부재) 재사용 — 신규 표면 0.

---

## 2. 작업 목록

### W5b-1. 저장소(레슨 히스토리 읽기) — `apps/mobile/src/lib/progress-repo.ts` (vitest)

기존 `ProgressRepo`에 **읽기 메서드만 추가**(쓰기 경로·스키마 무변경):

- 타입 `LessonSessionSummary`: `{ id, lessonId, status: SessionStatus, startedAt: string(ISO), completedAt: string | null, summary: unknown }`.
- 턴 재생용 `LessonTurnRow`: `{ order, role: 'user'|'assistant', transcript, corrections: Correction[] }`
  (튜터 `TutorTurnRow`와 동형 — 상세 화면이 공유). corrections는 방어적 변환(신뢰 경계, 알 수 없는 형태 버림).
- 메서드:
  - `listSessions(): Promise<LessonSessionSummary[]>` — 본인 세션 최신순(`started_at desc`). 활성+완료 모두.
  - `getSession(id): Promise<LessonSessionSummary | null>` — 없으면 null(타인 id는 RLS가 0행 → null).
  - `getSessionTurns(id): Promise<LessonTurnRow[]>` — `(session_id, order asc)`. 기존 turns select RLS 재사용.
- **Mock 확장**(웹/E2E·오프라인): 완료 세션 보존 + 시작시각 저장.
  - 활성 세션(`getOrCreateSession`)에 `startedAtMs` 부여.
  - `completeSession`: 활성에서 제거하되 **완료 레코드로 보존**(상태 completed·completedAt·lessonId·startedAtMs).
    `getOrCreateSession`은 활성만 조회(완료 세션 재개 안 함 — 현행 동작 유지).
  - 턴(`state.turns[sessionId]`)은 이미 완료 후에도 보존됨 — `getSessionTurns`가 그대로 읽음.
  - `listSessions`/`getSession`은 활성+완료 합쳐 반환.
- **Supabase 무변경(행 보존)**: status='completed' 행이 남아 있으므로 select만 추가.
- **완료**: progress-repo.test.ts — 목록 최신순·턴 순서·완료 후에도 조회 가능·없는 id는 null·corrections
  방어 변환. Fake Supabase(본인 select 형태) 테스트(기존 패턴 재사용).

### W5b-2. 히스토리 통합 집계(순수 헬퍼) — `apps/mobile/src/lib/history.ts` (vitest)

- 타입 `HistoryItem`: `{ kind: 'tutor', session: TutorSessionSummary } | { kind: 'lesson', session: LessonSessionSummary }`.
- 순수 함수 `mergeHistory(tutor: TutorSessionSummary[], lesson: LessonSessionSummary[]): HistoryItem[]`
  — 각각 kind 태깅 후 `startedAt` 내림차순 병합(불변 입력, 저장소 의존 없음 → 단위 테스트 용이).
- 제목 해석 헬퍼 `historyTitle(item)`: tutor → `sessionTitle(topic)`(기존), lesson → `findLesson(lessonId)?.lesson.title ?? '레슨'`.
- **완료**: history.test.ts — 병합 정렬·kind 태깅·빈 배열·동시각 안정성, 제목 해석(레슨/튜터/미상).

### W5b-3. UI — 통합 목록 + kind 라우팅 + 레슨 교정 저장

- **목록** `app/history/index.tsx`: `getTutorRepo().listSessions()` + `getProgressRepo().listSessions()` 동시
  로드(TanStack Query, `Promise.all`) → `mergeHistory` → 카드. 카드에 **종류 배지**(레슨/AI 튜터).
  레슨 카드 메타는 상태(완료/진행 중), 튜터 카드는 기존(분·턴·목표). 탭 → `/history/[id]?kind=…`.
- **상세** `app/history/[id].tsx`: `useLocalSearchParams`에서 `kind` 읽어 저장소 분기.
  - lesson: `getProgressRepo().getSession(id)/getSessionTurns(id)`, 제목 `findLesson`.
  - tutor: 기존 경로 유지.
  - 턴 렌더는 동형(구조적 동일)이라 공유. 교정 칩 길게 눌러 저장(기존 `useSaveExpression`).
  - 잘못된/누락 kind는 tutor 기본값으로 안전 처리(기존 동작 회귀 방지).
- **레슨 라이브 대화 교정 저장** `components/lesson/ConversationStep.tsx` + `app/lesson/[id].tsx`:
  - ConversationStep에 **선택적** props `onSaveCorrection?(c, context)` / `isSaved?(c)` 추가. 주어지면
    교정 칩을 `Pressable`(onLongPress)로 감싸고 저장 표식(✓). 미주입 시 기존 표시(회귀 0).
    context는 해당 교정이 붙은 me 버블의 `text`.
  - lesson/[id].tsx: `useSaveExpression()` 연결해 props 주입. 튜터와 동일 UX("길게 눌러 저장").
- StyleSheet + `@ted-speak/shared` 토큰만(인라인 hex 금지). 배지·신규 스타일도 토큰.
- **완료**: Expo Go ① 대화 기록에 레슨·튜터 세션 시간순 혼합 표시 → 레슨 상세 턴·교정 재생,
  ② 레슨 대화 중 교정 길게 눌러 저장 → 프로필 "저장한 표현" 반영.

### W5b-4. 검증·문서

- `npm run ci` 그린(커버리지 게이트 80 유지). 신규 `history.ts`는 `packages`/`apps lib` 글롭 확인 —
  `vitest.config.ts` coverage.include에 `apps/mobile/src/lib`가 디렉토리면 자동, 파일 단위면 `history.ts` 등록.
- 기존 vitest·E2E(튜터 15/15, mock-flow) 회귀 무변경 확인. verify-rls는 스키마 무변경이라 케이스 추가 없음
  (레슨 RLS는 init.sql 기존 케이스가 이미 커버 — 회귀만 확인).
- E2E(선택): mock-flow 또는 신규에 "레슨 완료 → 대화 기록에 레슨 카드 표시" 1케이스.
- 문서: 이 작업계획서, p2-w5-history.md §5 이월 항목 해소 표기, ADR-0011은 패턴 동일이라 **신규 ADR 불필요**
  (필요 시 ADR-0011에 레슨 확장 부록 한 줄). HANDOFF 갱신.

---

## 3. 순서·의존성

```
W5b-1(레슨 읽기 저장소) ─┐
W5b-2(병합 순수 헬퍼)   ─┼─→ W5b-3(UI) ─→ W5b-4(검증·문서)
                         └ W5b-3은 W5b-1·W5b-2 의존. ConversationStep 저장은 독립(W5 훅 재사용)
```

## 4. 완료 정의

- [ ] `ProgressRepo`에 `listSessions`/`getSession`/`getSessionTurns` (Mock 완료보존+Supabase select) + 테스트
- [ ] `mergeHistory`/`historyTitle` 순수 헬퍼 + 테스트(정렬·kind·제목)
- [ ] 대화 기록 통합 목록(레슨·튜터 시간순·종류 배지) + 상세 kind 라우팅(레슨 턴·교정 재생)
- [ ] 레슨 라이브 대화 교정 길게 눌러 저장(ConversationStep 선택적 props, 회귀 0) → 복습 목록 반영
- [ ] `npm run ci` 그린, 기존 vitest·E2E(튜터·mock-flow) 회귀 무변경, 레슨 히스토리 E2E(선택)
- [ ] 문서 갱신(작업계획서·p2-w5-history §5 해소·HANDOFF)

## 5. 이월(후속)

- 레슨 완료 점수(user_progress) 히스토리 카드 노출 — 조인 필요, Phase 3 학습 정착과 함께.
- 레슨 세션 발화시간·턴수 비정규화(목록 메타 풍부화) — 필요 시 완료 시 컬럼 추가(보안 민감 스키마 변경).
- W6 주간 리포트: 레슨+튜터 `listSessions()` 통합 집계 재사용.
