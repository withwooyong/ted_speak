# P2 W3 — 롤플레이 시나리오 작업계획서

> Ted Speak (TalkTed) Phase 2 W3 | 2026-06-13 작성 (세션 6)
> 근거: docs/plans/p2-tutor.md W3, ADR-0007(Realtime 승인)·ADR-0008(전송 seam) | 파이프라인: /ted-run
> 전략: **W2 재사용 극대화** — 같은 세션 상태머신·전송 인터페이스(`TutorTransport`)·저장소(`tutor_sessions`)
> 위에 "역할·목표·종료 조건"이 있는 롤플레이를 얹는다. 프롬프트(시나리오)와 목표 추적만 추가, 라이브
> 전송은 W2와 동일하게 이월(목 전송 + 텍스트 미리보기로 동선 완결).

---

## 1. 목표·범위

프리토킹(W2) 옆에 **롤플레이**를 연다. 시드 시나리오 4종(레스토랑·공항·면접·호텔)에서 Ted가 배역
(웨이터·공항 직원·면접관·호텔 직원)을 맡고, 학습자는 **달성할 목표(objectives)**를 가진 채 대화한다.
세션 종료 시 **목표 달성 판정**(X/Y 달성 + 체크리스트)을 보여준다.

**핵심 재사용**: 롤플레이는 별도 테이블·전송을 만들지 않는다.
- 세션 상태머신(`tutor-core.ts`)·전송(`tutor-transport.ts`)·저장소(`tutor_sessions`/`tutor-repo.ts`)·
  일일 캡·5분 cap·6턴 윈도우를 **그대로** 쓴다. → **스키마 변경 없음 = 보안 민감 아님**(일반 /ted-run).
- scenario id는 기존 `tutor_sessions.topic`(free text)에 저장. 프리토킹/롤플레이 구분은 "topic이 알려진
  scenario id인가"로 파생(W5 히스토리·W6 리포트가 쓸 수 있게 `summary.kind`도 함께 기록).

**이번 W3에서 하지 않는 것(W2와 동일하게 이월)**: 라이브 Realtime 전송, 실마이크, 실기기 검증.
목표 달성 판정은 W3에서는 **목 전송이 결정적으로 신호**(라이브에선 모델이 판정) — seam 계약만 정의.

**콘텐츠 출처 차이(설계 결정)**: 프리토킹 주제는 코드 상수(`TUTOR_TOPICS`, tutor-core). 롤플레이는
역할·목표·성공 기준이 있는 **콘텐츠**이므로 `content/` JSON + zod 단일 출처(`validate:content` 가드)로
간다(시드 레슨과 동형). 운영자가 코드 수정 없이 시나리오를 늘릴 수 있는 토대.

## 2. 작업 목록

### W3-1. 콘텐츠 스키마 확장 + 시드 4종 — `packages/shared/src/content-schema.ts`, `content/roleplay/*.json`

- `RoleplayObjectiveSchema`: `{ id: string, label(ko): string, labelEn: string }` — 학습자 목표 1개.
- `RoleplayScenarioSchema`:
  - `id`, `title`(ko), `titleEn`, `level`(CEFR enum 재사용), `order`(int positive)
  - `setting`(ko, 상황 설명 — 사용자 노출), `learnerRole`(ko, 학습자 배역)
  - `tedRole`(ko, Ted 배역 — 헤더 노출), `tedPersona`(en, 모델 system 프롬프트 주입용 배역·톤)
  - `openingLine`(en, Ted 첫 발화 — 세션 시작 시 노출/주입)
  - `objectives`: `RoleplayObjectiveSchema` 배열 `.min(2).max(4)` (달성 체크리스트)
- `RoleplayCollectionSchema = z.object({ scenarios: z.array(RoleplayScenarioSchema).min(1) })`.
- `z.infer`로 `RoleplayObjective`·`RoleplayScenario` 파생, export. **인터페이스 중복 정의 금지**.
- 시드: `content/roleplay/scenarios.json` — 레스토랑·공항·면접·호텔 4종, 각 objectives 2~3개,
  A2~B1 수준, openingLine은 자연스러운 영어 첫 문장.
- 로드/검증: `content/index.ts`에 `roleplayScenarios = RoleplayCollectionSchema.parse(...)` + `findScenario(id)`.
- **완료**: `npm run validate:content`(content-schema.test.ts에 RoleplayScenario 케이스 추가) 통과,
  `content/index.ts` 로드 시 4종 검증 통과.

### W3-2. 코어 — 목표 추적 (순수) — `apps/mobile/src/lib/tutor-core.ts` (vitest)

W2 상태머신을 **확장**(분기 추가 아님, 프리토킹 동작 불변):
- `TutorState`에 추가: `objectives: readonly RoleplayObjective[]`(프리토킹=빈 배열), `metObjectiveIds: string[]`.
  `RoleplayObjective`는 `@ted-speak/shared`에서 import(단일 출처 — Correction과 동일 패턴).
- `createTutorState(topicId, objectives = [])` — 롤플레이는 시나리오 objectives 주입, 프리토킹은 기본 빈 배열.
- `TedTurnInput`/`applyTedTurn`에 `metObjectiveIds?: string[]` 추가 — 들어오면 state.metObjectiveIds에
  **합집합 머지**(중복·미지의 id 무시: objectives에 있는 id만 채택). 프리토킹은 미지정 → no-op.
- `summarizeTutor`: 롤플레이(objectives.length>0)면 `goal` 필드 추가 —
  `{ total, met, achieved: met===total, checklist: {id,label,met}[] }`. 프리토킹이면 `goal: null`(기존 동작 유지).
  strengths/improvements 문구도 롤플레이 톤 한 줄 보강(목표 달성 시 칭찬).
- **완료**: 목표 머지(부분/전체/미지의 id/중복), goal 판정(0/부분/전체), 프리토킹 회귀(goal=null,
  기존 테스트 그린) 단위 테스트.

### W3-3. 전송 — 롤플레이 목 — `apps/mobile/src/lib/tutor-transport.ts` (vitest)

- `TutorReply`에 `metObjectiveIds?: string[]` 추가(전송→코어 신호 계약). 기존 mock/realtime 무영향.
- `createRoleplayMockTransport(scenario, callbacks, opts?)`: 시나리오 배역에 맞는 스크립트 응답 +
  **턴마다 objectives를 순서대로 1개씩 달성 신호**(결정적). 모든 목표 신호 후엔 마무리 멘트.
  텍스트 폴백도 이 경로(W2와 동일 — ADR-0005 Fallback). 라이브 판정은 이월(스텁 주석).
- **완료**: 시나리오 1개를 mock 전송으로 끝까지 진행 시 모든 objectives 신호 → 코어 goal.achieved=true
  결정적 통과.

### W3-4. UI — 롤플레이 진입·세션·판정 — `apps/mobile/src/app/(tabs)/tutor.tsx`

- 주제 선택 화면에 **롤플레이 섹션** 추가(프리토킹 주제 아래): scenario 카드(title·tedRole·setting 한 줄).
  일일 캡은 프리토킹과 **공유**(같은 tutor_sessions·캡 — 비용 통제 일원화).
- 세션 화면: 헤더에 Ted 배역, **목표 체크리스트**(달성 시 체크/스트라이크), openingLine을 첫 Ted 버블로.
  교정 칩·타이머·텍스트 입력은 W2 컴포넌트 재사용.
- 요약 화면: 롤플레이면 **목표 달성 판정 카드**("목표 3/3 달성 🎉" 또는 "2/3") + 체크리스트.
  프리토킹 요약은 기존 그대로(분기).
- 저장: `createSession(topic=scenarioId)` 재사용, `completeSession`에 `summarizeTutor` 결과(goal 포함) 전달.
- StyleSheet + `@ted-speak/shared` 토큰만(인라인 hex 금지). 라이브 부재 배너는 W2와 공유.
- **완료**: Expo Go에서 롤플레이 시나리오→세션(목표 점진 달성)→판정 동선 동작, 프리토킹 동선 회귀 정상.

### W3-5. 검증·등록

- `vitest.config.ts` coverage.include 확인(tutor-core·transport 이미 등록 — 신규 파일 없으면 변경 불필요).
- E2E(선택): `e2e/tutor-flow.spec.mjs`에 롤플레이 1종 완주 케이스 추가(주제→목표 달성→판정 노출).
- `npm run ci` 그린(커버리지 게이트 80 유지), `npm run validate:content` 통과.

## 3. 순서·의존성

```
W3-1(스키마+시드) ─→ W3-2(코어 목표) ─→ W3-3(전송 목) ─→ W3-4(UI) ─→ W3-5(검증)
                      └ W3-2는 W3-1의 RoleplayObjective 타입 의존
```
권장: W3-1 → W3-2 → W3-3 → W3-4 → W3-5 (선형 — 각 단계가 다음의 타입/계약 제공)

## 4. 완료 정의

- [ ] `RoleplayScenario` zod 스키마 단일 출처 + 시드 4종, `validate:content` 통과
- [ ] 코어 목표 추적(머지·판정) 단위 테스트 그린 + 프리토킹 회귀 정상
- [ ] 롤플레이 목 전송으로 시나리오 1종 완주 → goal.achieved 결정적
- [ ] tutor 탭 롤플레이 진입→세션→**목표 달성 판정** 동선 Expo Go 동작(목 전송 + 텍스트 폴백)
- [ ] 일일 캡·세션 cap이 프리토킹과 공유로 동작
- [ ] `npm run ci` 그린, E2E 롤플레이 케이스(선택) 통과

## 5. 이월(후속, W2 이월과 합류)

- 라이브 전송 도입 시 롤플레이 목표 판정을 모델 신호로 전환(목 → Realtime). seam 계약(`metObjectiveIds`)은
  이미 정의되어 있으므로 전송 구현만 교체.
- 프리토킹/롤플레이 구분을 위한 `tutor_sessions.kind` 컬럼은 W5(히스토리)·W6(리포트) 착수 시 필요하면
  도입(스키마 변경 = 보안 민감 ted-run). W3는 `summary.kind`로 우선 파생.
