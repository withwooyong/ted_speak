# ADR-0009: 롤플레이 — 프리토킹 seam 재사용 + 목표 추적

- 날짜: 2026-06-13
- 상태: **승인** (P2 W3)
- 관련: ADR-0007(Realtime 승인), ADR-0008(전송 seam), docs/plans/p2-w3-roleplay.md, PLAN.md §4.3

## 맥락

P2 W3은 프리토킹(W2) 옆에 **롤플레이**(레스토랑·공항·면접·호텔)를 추가한다. 롤플레이는 프리토킹과
거의 같다 — 같은 5분 cap·6턴 윈도우·일일 캡·교정·요약 — 단 **역할(배역)·목표(objectives)·종료 시
목표 달성 판정**이 더 있다. 두 가지를 결정해야 했다.

1. **저장·전송을 새로 만들 것인가, 재사용할 것인가** — 롤플레이 전용 테이블/전송을 둘지, W2의
   `tutor_sessions`·`TutorTransport`를 그대로 쓸지.
2. **롤플레이 콘텐츠를 어디에 둘 것인가** — 프리토킹 주제처럼 코드 상수로 둘지, 시드 레슨처럼
   `content/` JSON + zod로 둘지.
3. **목표 달성을 누가, 어떻게 판정하는가** — 라이브에선 모델이, 목/텍스트 미리보기에선 무엇이.

## 결정

### 1. tutor_sessions·TutorTransport를 재사용한다 (새 테이블·전송 없음)

롤플레이는 W2의 세션 상태머신·저장소·전송 인터페이스를 **그대로** 쓴다.
- scenario id는 기존 `tutor_sessions.topic`(free text) 컬럼에 저장한다. 프리토킹/롤플레이 구분은
  "topic이 알려진 scenario id인가"로 파생하고, 요약 jsonb의 `goal` 유무로도 식별된다.
- **스키마 변경·새 RLS 없음** → 이번 작업은 보안 민감이 아니다(일반 ted-run). 일일 캡·세션 cap·
  비용 통제(ADR-0007)가 두 모드에 **공유**로 적용돼 통제 표면이 하나로 유지된다.
- 라이브 전송도 ADR-0008의 같은 seam(`TutorTransport`)을 쓴다 — 롤플레이는 프롬프트(배역)와
  목표 신호만 추가될 뿐 전송 구현은 동일하다.

**대안(기각)**: `roleplay_sessions` 별도 테이블 — RLS·캡 로직 중복, 비용 통제 분산, 보안 표면 증가.
이득 없음. 모드 구분을 위한 `tutor_sessions.kind` 컬럼은 W5(히스토리)·W6(리포트)에서 **실제로 필요할
때** 도입한다(스키마 변경 = 보안 민감). 그 전까지 `summary.goal`로 파생.

### 2. 롤플레이 콘텐츠는 content/ JSON + zod 단일 출처

프리토킹 주제(`TUTOR_TOPICS`)는 코드 상수지만, 롤플레이는 **역할·목표·성공 기준이 있는 콘텐츠**라
시드 레슨과 동형으로 둔다 — `content/roleplay/scenarios.json` + `RoleplayScenarioSchema`(zod,
`packages/shared/src/content-schema.ts`). 타입은 `z.infer`로만 파생(중복 정의 금지), `validate:content`가
가드, 로드 시점(`content/index.ts`)에 `RoleplayCollectionSchema.parse`로 즉시 검증. 운영자가 코드 수정
없이 시나리오를 늘릴 수 있는 토대이며, Phase 3 Admin/콘텐츠 확장과 자연스럽게 합류한다.

### 3. 목표는 전송→코어 신호(metObjectiveIds)로 추적, 코어가 신뢰 경계를 둔다

목표 달성은 전송 계층이 `TutorReply.metObjectiveIds`로 신호하고, 코어(`applyTedTurn`)가 누적한다.
- **라이브**: 모델이 대화 맥락에서 목표 충족을 판정해 신호(후속 — 전송 구현 시).
- **목/텍스트 미리보기**: `createRoleplayMockTransport`가 시나리오 objectives를 **턴마다 순서대로 1개씩**
  결정적으로 신호(디바이스 없이 동선·판정 완결).
- **코어의 신뢰 경계**: `mergeMetObjectives`는 시나리오 objectives에 **실제로 존재하는 id만** 채택하고
  중복을 제거한다. 전송이 미지의/위조 id를 보내도 판정이 오염되지 않는다(목표 달성은 향후 보상·통계
  연계 가능성이 있어, 클라/모델 신호를 무비판 수용하지 않는다).
- 종료 시 `summarizeTutor`가 `goal{ total, met, achieved, checklist }`를 만든다(프리토킹은 `goal:null`).

## 결과

- 프리토킹 동선·테스트는 **무변경 회귀**(objectives 기본 빈 배열 → 기존 동작 보존). vitest 353·E2E 10/10
  (프리토킹 6 + 롤플레이 4). 시드 4종 `validate:content` 통과.
- 라이브 음성·실기기·시나리오별 비용 재측정은 ADR-0008 이월과 합류(같은 seam이라 전송만 교체).

## 한계·이월

- 목표 판정 품질은 라이브에서 **모델 신호 정확도**에 달려 있다(목은 결정적). 라이브 도입 시 모델
  목표-판정 프롬프트 설계·오판정율 점검이 필요하다.
- 프리토킹/롤플레이 통계 분리가 필요해지면 `tutor_sessions.kind` 도입(보안 민감 ted-run).
