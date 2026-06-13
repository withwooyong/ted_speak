# P2 W5 — 대화 히스토리 + 표현 저장 작업계획서

> Ted Speak (TalkTed) Phase 2 W5 | 2026-06-13 작성 (세션 8)
> 근거: docs/plans/p2-tutor.md W5, PLAN.md §8(SavedExpression) | 파이프라인: /ted-run(스키마 변경 = 보안 민감)
> 전략: **히스토리는 기존 데이터 재사용(스키마 변경 0)**, **표현 저장만 신규 테이블 1개**.
> W2/W3가 이미 `tutor_sessions`/`tutor_turns`에 완결된 대화·교정 로그를 적재한다 — 읽기 경로만 열면 히스토리가 된다.

---

## 1. 목표·범위

레슨/튜터로 쌓인 발화를 **돌아보고(history) 복습(saved expressions)**할 수 있게 한다.
"더 많이 말하기"(P2 핵심) 다음 단계인 **정착(retention)**의 최소 토대.

두 부분으로 나뉜다:

1. **대화 히스토리** — 과거 튜터 세션 목록(주제·시간·턴수·목표 달성) + 탭 시 텍스트 재생(턴별 발화·교정).
   `tutor_sessions`/`tutor_turns`는 W2/W3에서 이미 본인 select RLS가 열려 있다 →
   **신규 테이블·RPC·스키마 변경 없음**. 저장소에 읽기 메서드만 추가.
2. **표현 저장** — 대화 중 교정 칩을 길게 눌러 저장 → `saved_expressions` 테이블 → 복습 목록·삭제.
   **유일한 신규 스키마**(보안 민감). W2 grant 화이트리스트 패턴을 따른다.

### 범위 결정(정직한 최소)

- **히스토리는 튜터 세션만.** 레슨 세션 기록은 이월 — 레슨은 `lesson/[id]` 안에서 완결 동선이 이미 있고,
  W5에서 둘을 합치면 표면이 커진다. 같은 읽기 패턴이므로 후속에서 레슨도 동일 메서드로 확장 가능(주석).
- **저장 출처는 튜터 교정 칩(활성 세션)** 우선. 히스토리 상세 화면의 교정에서도 저장 가능하면 좋지만,
  MVP 완료 기준은 "대화 중 저장 → 목록 → 복습"(PLAN §8 동선). 히스토리 상세 저장은 같은 핸들러 재사용으로
  비용 거의 0이면 포함, 아니면 이월.
- **표현 편집(update) 없음.** 저장 표현은 교정 스냅샷 — 저장/삭제만(노트는 불변, 수정=삭제 후 재저장).
- **과금·복습 SRS·알림 없음**(Phase 3). 복습 목록은 단순 리스트.

### 보안 설계 — `saved_expressions`는 왜 delete를 허용하나(tutor_sessions와 다름)

- `tutor_sessions`/`tutor_turns`는 **불변 로그 + 캡 표면**(발화시간·턴수가 비용 통제·향후 통계에 연결) →
  delete 금지(cascade 우회·파밍 방어, ADR-0008).
- `saved_expressions`는 **사용자 소유 노트** — 통계 누적·캡·보상에 일절 연결하지 않는다(파밍 표면 0).
  사용자가 복습 목록을 큐레이션하는 게 자연스러우므로 **delete 허용**. 단 insert는 컬럼 화이트리스트로
  잠가 서버 default(`created_at`)·`id` 위조를 막고, **update grant는 두지 않는다**(편집 비목표).

---

## 2. 작업 목록

### W5-1. 스키마 — `saved_expressions` 테이블 + RLS — `supabase/migrations/20260613110000_saved_expressions.sql` (보안 민감)

- 테이블(컬럼은 `Correction`(feedback-schema) 미러 + 맥락):
  - `id uuid pk default gen_random_uuid()`
  - `user_id uuid not null references auth.users(id) on delete cascade`
  - `original text not null` / `suggested text not null` — 교정 전/후
  - `type text not null check (type in ('grammar','vocab','pronunciation'))` — `Correction.type` 미러
  - `context text` — 교정이 나온 사용자 발화(복습 시 문맥, 선택)
  - `created_at timestamptz not null default now()`
- 인덱스: `(user_id, created_at desc)`(목록), `unique (user_id, original, suggested)`(중복 저장 방지).
- RLS: select/insert/delete 모두 `(select auth.uid()) = user_id`. **update 정책 없음**(편집 비목표).
- 컬럼 lockdown(user_progress/tutor_sessions 패턴):
  `revoke insert, update ... from anon, authenticated;`
  `grant insert (user_id, original, suggested, type, context) ... to authenticated;`
  (update grant 없음 — 노트 불변.)
- **완료**: `supabase db reset` 통과(마이그레이션 5건), `verify-rls.mts`에 케이스 추가(아래 W5-5) 그린.

### W5-2. 타입 + 저장소(표현) — `packages/shared/src/feedback-schema.ts`, `apps/mobile/src/lib/saved-repo.ts` (vitest)

- **zod 단일 출처**(feedback-schema.ts): `SavedExpressionSchema`
  - `{ id: string, original: string, suggested: string, type: Correction.type 재사용, context?: string, createdAt: string(ISO) }`
  - `SavedExpressionInput`(저장 입력 = id·createdAt 제외): `CorrectionSchema` 필드 + `context?`.
    가능하면 `CorrectionSchema`를 `.extend`/`.pick`으로 재사용(중복 정의 금지, `z.infer` 파생).
- `apps/mobile/src/lib/saved-repo.ts` — tutor-repo와 동형(Mock vs Supabase 분기, 팩토리):
  - `SavedRepo`: `save(input): Promise<void>`(중복이면 무시/upsert ignore), `list(): Promise<SavedExpression[]>`(최신순),
    `remove(id): Promise<void>`.
  - Mock(KeyValueStorage, namespace 격리 — tutor-repo Mock 패턴 재사용): 웹/E2E·오프라인.
  - Supabase: `.from('saved_expressions')` insert(화이트리스트 컬럼만)·select(최신순)·delete(본인 RLS).
    중복은 `unique` 제약 → insert 충돌 시 무시(`ignoreDuplicates`/onConflict) 또는 사전 존재 체크.
- **완료**: saved-repo.test.ts — Mock(저장·중복무시·목록순서·삭제·namespace 격리) + Fake Supabase
  (화이트리스트 insert·본인 select·delete) 이중 테스트(tutor-repo.test.ts 패턴).

### W5-3. 저장소(히스토리 읽기) — `apps/mobile/src/lib/tutor-repo.ts` (vitest)

기존 `TutorRepo`에 **읽기 메서드만 추가**(스키마·쓰기 경로 무변경):
- `listSessions(): Promise<TutorSessionSummary[]>` — 본인 세션 최신순(`started_at desc`).
  반환: `{ id, topic, status, startedAt, durationSeconds, turnCount, summary }`(summary는 goal·strengths 포함).
- `getSessionTurns(sessionId): Promise<TutorTurnRow[]>` — `(session_id, order asc)`, `{ order, role, transcript, corrections }`.
  기존 select RLS(세션 소유권 위임)로 충분 — **신규 RPC 불필요**.
- Mock: 로컬에 적재한 세션/턴 반환(현재 Mock이 턴을 보관하지 않으면 보관하도록 최소 확장 — 웹 동선·E2E용).
- **완료**: tutor-repo.test.ts에 목록 최신순·턴 순서·본인 격리 테스트 추가.

### W5-4. UI — 프로필 진입 + 히스토리/복습 화면 + 교정 저장 — `apps/mobile/src/app/(tabs)/profile.tsx`, `app/history/*`, `app/saved/*`, `(tabs)/tutor.tsx`

- **프로필 탭**(profile.tsx): infoBox 아래 진입 카드 2개(기존 `InfoRow`/패널 토큰 재사용):
  "대화 기록"(→ `/history`), "저장한 표현"(개수 + → `/saved`).
- **히스토리 목록** `app/history/index.tsx`: `listSessions()` → 세션 카드(주제·날짜·시간·턴수, 롤플레이면 목표 X/Y).
  탭 → `/history/[id]`.
- **히스토리 상세** `app/history/[id].tsx`: `getSessionTurns(id)` → 턴별 버블(user/assistant) + 교정 칩 재생.
  요약(summary) 상단 노출. (여력 시 교정 칩 길게 눌러 저장 — 핸들러 재사용.)
- **복습 목록** `app/saved/index.tsx`: `list()` → 표현 카드(original → suggested, type 배지, context),
  스와이프/길게 눌러 삭제(`remove`).
- **교정 저장 동선**(tutor.tsx active 화면, 현재 369–376행 교정 칩): 각 칩을 `Pressable`로 감싸 `onLongPress` →
  `save({ original, suggested, type, context: 마지막 사용자 발화 })` + 저장 피드백(체크/토스트, 토큰 색만).
  이미 저장된 칩은 표식(중복 무시).
- StyleSheet + `@ted-speak/shared` 토큰만(인라인 hex 금지). 신규 화면도 canvas/paper/radius 토큰 사용.
- **완료**: Expo Go에서 ① 튜터 대화 중 교정 길게 눌러 저장 → 프로필 "저장한 표현" → 복습 목록·삭제,
  ② 프로필 "대화 기록" → 세션 목록 → 상세(턴·교정) 텍스트 재생 동선 동작.

### W5-5. 검증·등록

- `scripts/verify-rls.mts`에 `saved_expressions` 케이스 추가(예상 6~8):
  익명 차단(select/insert), 타인 행 select/insert/delete 차단, 본인 insert/select/delete 허용,
  컬럼 화이트리스트(`created_at`/`id` 직접 위조 차단), update grant 부재 확인, 중복 unique.
- `vitest.config.ts` coverage.include: `apps/mobile/src/lib`가 디렉토리 글롭이면 `saved-repo.ts` 자동 포함 —
  파일 단위 등록이면 추가(커밋 전 확인).
- E2E(선택): `e2e/tutor-flow.spec.mjs` 또는 신규에 "교정 저장 → 복습 목록" 1케이스.
- `npm run ci` 그린(커버리지 게이트 80 유지), `npm run validate:content` 통과(콘텐츠 무변경이지만 회귀 확인),
  E2E mock-flow 회귀(드릴·튜터 동선 무변경).

---

## 3. 순서·의존성

```
W5-1(스키마) ─→ W5-2(표현 타입·저장소) ─┐
              W5-3(히스토리 읽기, 독립)  ─┼─→ W5-4(UI) ─→ W5-5(검증)
                                         └ W5-4는 W5-2·W5-3 메서드 의존
```
권장: W5-1 → (W5-2 ∥ W5-3) → W5-4 → W5-5.
W5-3은 스키마 무변경이라 W5-1과 독립이지만, ted-run 한 흐름에선 선형 진행해도 무방.

## 4. 완료 정의

- [ ] `saved_expressions` 마이그레이션(RLS·grant 화이트리스트·delete 허용·update 부재) + `verify-rls.mts` 케이스 그린
- [ ] `SavedExpressionSchema` zod 단일 출처(`Correction` 재사용, `z.infer`) + saved-repo Mock/Supabase 이중 테스트
- [ ] 튜터 세션 히스토리 목록·턴 재생(기존 RLS select 재사용, 신규 RPC 0) + 저장소 테스트
- [ ] tutor 탭 교정 칩 길게 눌러 저장 → 프로필 → 복습 목록·삭제 Expo Go 동선
- [ ] 프로필 → 대화 기록 → 세션 상세(턴·교정 재생) 동선
- [ ] `npm run ci` 그린, E2E mock-flow 회귀(드릴·튜터 무변경), 저장 동선 E2E(선택)

## 5. 이월(후속)

- ~~**레슨 세션 히스토리**: 같은 읽기 패턴(`lesson_sessions`/`conversation_turns` 본인 select)으로 확장 가능 —
  히스토리 화면에 레슨 탭 추가 시점에. W5는 튜터만.~~ → **W5b(세션 9)에서 완료**: 통합 목록(시간순)으로
  구현, 레슨 교정 저장도 연결. docs/plans/p2-w5b-lesson-history.md, ADR-0011 부록.
- **복습 SRS·즐겨찾기 정렬·태그**: Phase 3 학습 정착 기능.
- ~~**표현 저장의 lesson 교정 출처**: 레슨 대화 화면 교정에도 같은 `save` 핸들러 연결~~ → **W5b 완료**
  (`ConversationStep`에 `useSaveExpression` 연결, 저장소는 출처 무관).
- **W6 주간 리포트**: W5가 연 `listSessions()` 집계를 재사용(교정 TOP5는 `saved_expressions`/턴 corrections 집계).
