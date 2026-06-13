# ADR-0011: 대화 히스토리(읽기 재사용) + 표현 저장(사용자 소유 노트)

- 날짜: 2026-06-13
- 상태: **승인** (P2 W5)
- 관련: ADR-0008(tutor_sessions 안티-파밍), ADR-0009(롤플레이 seam 재사용), docs/plans/p2-w5-history.md, PLAN.md §8

## 맥락

P2 W5는 쌓인 발화를 **돌아보고(history) 복습(saved expressions)**하게 만든다.
W2/W3가 이미 `tutor_sessions`·`tutor_turns`에 완결된 대화·교정 로그를 적재한다. 두 가지를 결정해야 했다.

1. **히스토리 데이터 출처** — 새 테이블/RPC를 만들지, 기존 RLS select를 재사용할지.
2. **표현 저장 테이블의 보안 모델** — W2 안티-파밍(불변 로그·delete 금지·SECURITY DEFINER RPC)을
   그대로 따를지, 다르게 갈지. 특히 **delete 허용 여부**.

## 결정

### 1. 히스토리는 기존 RLS select를 재사용한다 — 신규 테이블·RPC·스키마 변경 0

`tutor_sessions`/`tutor_turns`는 W2에서 이미 본인 select RLS가 열려 있다(`user_id = auth.uid()`,
턴은 세션 소유권 위임). 저장소(`tutor-repo.ts`)에 **읽기 메서드만** 추가한다:
- `listSessions()` — 본인 세션 최신순(`started_at desc`)
- `getSession(id)` — 단건 메타(없으면 null, `eq('id')`)
- `getSessionTurns(id)` — 턴 order 오름차순

타인 id를 URL에 넣어도(IDOR 시도) RLS가 0행을 반환하므로 클라 측 소유권 체크 없이 안전하다 — RLS가
신뢰 경계다. 히스토리는 **튜터 세션만**(레슨 세션은 이월 — 같은 읽기 패턴으로 후속 확장 가능).

### 2. `saved_expressions`는 사용자 소유 노트 — **delete 허용**(W2와 의도적으로 다름)

유일한 신규 테이블(보안 민감). W2 패턴(컬럼 grant 화이트리스트, `(select auth.uid()) = user_id` RLS,
PII 미로깅 `dataError`)을 따르되, **delete를 허용**한다. 근거:

- `tutor_sessions`/`tutor_turns`는 **불변 로그 + 캡 표면**(발화시간·턴수가 비용 통제·향후 통계에 연결)
  이라 delete를 금지했다(cascade로 불변 턴이 우회 삭제되는 것 방지, ADR-0008).
- `saved_expressions`는 **통계·캡·보상에 일절 연결되지 않는다**(파밍 표면 0). child 테이블도 불변 로그도
  없다. 사용자가 복습 목록을 큐레이션하는 게 자연스러우므로 delete가 정당하다.

대신:
- **insert는 컬럼 화이트리스트**(`user_id, original, suggested, type, context`)만 — `id`(uuid default)·
  `created_at`(now() default) 서버 권위 컬럼 위조 차단. anon은 revoke로 insert 권한 자체가 없다.
- **update 정책·grant 둘 다 없음** — 노트는 교정 스냅샷(불변). 편집 = 삭제 후 재저장.
- **길이 CHECK**(original/suggested 1~500, context ≤1000) + `unique(user_id, original, suggested)` —
  미세 변형으로 dedup을 우회한 대량 저장(스토리지 abuse) 1차 방어. 중복 저장은 23505를 클라가 삼켜
  idempotent 처리(unique가 user_id 스코프라 사용자 간 정보 추론 불가).

### 3. 교정 칩 길게 눌러 저장 — 출처 무관 저장소

저장 동선은 `useSaveExpression` 훅(낙관적 표시, 실패 시 롤백, PII 미로깅)으로 튜터 세션·히스토리 상세가
공유한다. 저장소는 출처를 모르므로 레슨 교정에도 같은 핸들러를 후속 연결할 수 있다.

## 대안

- **히스토리 전용 RPC/뷰**: 불필요 — 기존 RLS select가 본인 격리를 이미 보장. 표면만 늘린다.
- **saved_expressions delete 금지(W2와 동일)**: 복습 목록 큐레이션을 막아 UX를 해치고, 파밍 위험이
  없는데도 과도하게 제약. 기각.
- **표현 update 허용(편집)**: 노트를 가변으로 만들면 교정 스냅샷의 신뢰성이 흐려지고 grant 표면이
  늘어난다. 비목표 — 삭제 후 재저장으로 충분.

## 영향

- 신규 마이그레이션 1건(`saved_expressions`), `verify-rls.mts` +12 케이스(64/64). 신규 벤더·RPC 없음.
- vitest 400(+31), 커버리지 95.31/86.04/97.71. E2E tutor 15/15(W5 5건: 교정 저장·히스토리 재생·복습),
  mock 33/33 회귀.
- **이월**: 복습 SRS·즐겨찾기(Phase 3), W6 주간 리포트는 `listSessions()` 집계 재사용.

## 부록 — W5b 레슨 히스토리 확장 (세션 9, 2026-06-13)

위 "이월: 레슨 세션 히스토리"를 같은 읽기 패턴으로 실현했다(스키마 변경 0). `lesson_sessions`/
`conversation_turns`의 기존 본인 select RLS를 재사용해 `ProgressRepo`에 `listSessions`/`getSession`/
`getSessionTurns`만 추가했다(신규 RPC·grant 0). 대화 기록 화면은 순수 헬퍼 `mergeHistory(tutor, lesson)`로
튜터·레슨 세션을 시간순 통합하고, 상세는 `?kind=lesson|tutor`로 저장소를 분기한다(타인 id는 RLS가
0행 → null, 튜터와 동일한 IDOR 방어). 레슨 대화 교정도 `useSaveExpression`(튜터·히스토리 공용)을
`ConversationStep`(선택적 props, 미주입 시 회귀 0)에 연결했다. mock 모드는 완료 세션을 별도 `history`
맵에 보존(`getOrCreateSession`은 활성만 재개)해 웹/E2E 히스토리를 지원한다. vitest 419(+19),
E2E tutor 15/15·mock 33/33 회귀. 근거: docs/plans/p2-w5b-lesson-history.md.

## 부록 — W6 주간 스피킹 리포트 (세션 10, 2026-06-13)

W5/W5b의 "기존 select RLS 재사용 + 순수 집계" 패턴을 한 번 더 연장해 프로필에 **최근 7일 리포트**를
얹었다(스키마 변경 0·신규 RPC 0). `ProgressRepo`에 `listProgress()`(기존 "본인 진행도 조회" select RLS
재사용 — `user_progress`의 `completed_at`/`speaking_seconds`/`score` 읽기)만 추가했다. 집계는 순수
`weekly-report.ts`(`sumSpeakingSeconds`·`countCompletedLessons`·`topCorrections`·`collectWeeklyReport`).

**정직성 원칙(ADR-0010 선례 — 가짜 지표 출시 안 함)**: 세 지표 모두 클라이언트가 위조할 수 없는
서버 측 값만 집계한다 — 발화 시간은 레슨 `speaking_seconds`(완료 시 적재·불변) + 완료 튜터
`duration_seconds`(`complete_tutor_session` RPC가 `now()-started_at`로 산정, 진행 중 세션 제외), 완료
레슨 수는 `user_progress` 행 수(PK가 `(user_id, lesson_id)`라 레슨당 1행·최초 완료 시각), 교정 TOP5는
기간 내 세션 턴의 `corrections` 빈도. 클라 집계지만 원천이 서버 불변값이라 farming 표면 0.

**의도된 한계(정직하게 문서화)**: ① 레슨 발화 시간은 **최초 완료분만** 집계된다(`user_progress`가
레슨당 1행이라 재복습 발화는 세션 단위로 적재되지 않음 — 튜터는 매 세션 누적). ② 기간은 캘린더 주가
아닌 **rolling 7일**(월요일 빈 카드 UX 회피). ③ 교정 턴은 세션 `started_at` 기준 필터(완료 레슨은
`completed_at` 기준)라 경계에 걸친 레슨은 교정 누락 가능(레슨은 수 시간 내 완료라 실무상 무해).
Mock은 `progress`를 `{completedAt, speakingSeconds, score}` 레코드로 확장하고 **first-write-wins**로
서버 PK 불변·트리거 1회 누적과 패리티(구 문자열 포맷은 읽기 시 정규화). vitest 446(+27), 커버리지
95.61/85.03/98.11/97.79. E2E mock 34/34(S8 주간 카드)·tutor 15/15 회귀. 근거: docs/plans/p2-w6-weekly-report.md.

## 한계

- 히스토리 mock 모드(dev/web)는 턴 본문을 보존한다(네임스페이스 격리·웹은 메모리 폴백). 프로덕션
  supabase 모드와 무관.
- `saved_expressions` 일일 저장 횟수 rate-limit은 없다(길이·unique CHECK로 abuse 표면만 축소). 필요 시
  후속.
- 저장 표식(✓) 동기화는 화면 마운트 기준 — 다른 화면에서 삭제 후 복귀 시 즉시 반영되지 않을 수 있다
  (재마운트에 정정). MVP 수용.
