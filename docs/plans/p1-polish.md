# P1.5 — P1 잔여 다듬기 작업계획서

> Ted Speak (TalkTed) Phase 1 후속 | 2026-06-13 작성
> 근거: HANDOFF.md 세션 3 "다음 작업 후보 ③", 2b 리뷰 LOW 잔여 항목
> 파이프라인: /ted-run (**보안 민감** — profiles 스키마·grant 변경 포함) | 선행: p1-core-loop (U1~U10 완료)

---

## 1. 목표

P1 핵심 루프의 두 가지 잔여 결함을 해소한다:

1. **재로그인 시 서버 상태 미반영**: supabase 실로그인 모드에서 로그아웃(로컬 스토어 reset) 후
   재로그인하거나 새 기기에서 로그인하면, 서버 profiles에 온보딩이 저장된 기존 사용자도
   온보딩을 다시 타고 서버 streak·통계가 화면에 반영되지 않는다.
2. **TurnFeedback reply 길이 캡 부재**: 현재 max_tokens(220)만 의존 — 비정상적으로 긴 reply가
   TTS 비용·재생 시간을 키울 수 있다 (2b LOW).

**비목표**: OAuth(U11 — 별도 설계 문서), 웹 user 스토어 메모리 폴백(수용 결정 유지),
tts-cache 해시 확장(커뮤니티 콘텐츠 도입 시).

## 2. 작업 목록

### V1. profiles 재로그인 동기화 (스키마 + 클라이언트)

**스키마** (보안 민감 — grant 화이트리스트 검토):

- `profiles.onboarded_at timestamptz` 컬럼 추가 (null = 온보딩 미완료).
  가입 트리거가 기본값(level A2, goal daily)으로 행을 만들기 때문에 기존 컬럼만으로는
  "온보딩 완료"를 판별할 수 없다 — 전용 마커가 필요하다.
- `grant update (onboarded_at)` to authenticated 추가.
  위조 영향 분석: 사용자가 자기 행의 onboarded_at을 조작해도 결과는 *본인* 온보딩 스킵뿐 —
  통계·과금 컬럼과 달리 무해. RLS 행 정책으로 타인 행은 불가.
- `scripts/verify-rls.mts`에 케이스 추가: ① 본인 onboarded_at update 허용
  ② 타인 행 update 거부(기존 정책 커버 확인) ③ streak 등 비-grant 컬럼은 여전히 거부.

**클라이언트**:

- 온보딩 완료 시 profiles update payload에 `onboarded_at`(ISO 문자열) 포함 —
  `buildProfileUpdate()` 화이트리스트에 추가 + 주석의 grant 목록 동기화.
- **하이드레이트**: supabase 실로그인(!isMock) 세션 확립 시 profiles 1회 재조회:
  - `onboarded_at != null` → user 스토어에 goal/level/dailyGoalMinutes 반영 + onboarded=true
    (온보딩 스킵, 홈 직행)
  - streak·last_study_date는 **서버가 권위 출처**(handle_progress_recorded 트리거) — 로컬 값을 덮어쓴다.
  - xp·todaySpeakingSeconds는 서버 컬럼이 없음 — 로컬 유지 (xp 서버화는 Phase 2+).
  - micGranted는 기기 로컬 속성 — 동기화하지 않는다.
  - 재조회 실패 시 로컬 상태로 폴백 (온보딩 재진입 허용 — 진행 차단 금지).
- **require cycle 방지**: auth.ts ↔ user.ts 직접 import 추가 금지 —
  `lib/progress.ts`의 auth 스토어 구독 패턴을 따른다.
- mock 모드는 변화 없음 (로컬 persist가 단일 출처).

**테스트**:

- 순수 로직(하이드레이트 매핑·폴백 판정)은 RN 의존 없는 core 모듈로 분리해 vitest 단위 테스트
  (vitest.config.ts coverage.include 등록).
- E2E(웹 Playwright, 로컬 supabase): 가입→온보딩→로그아웃→재로그인→**온보딩 스킵·홈 직행**,
  profiles.onboarded_at DB 반영 확인.

### V2. TurnFeedback reply 길이 캡 (clamp)

- 스키마 `.max()` 하드 실패는 채택하지 않는다 — LLM이 캡을 넘겨도 턴 전체를 실패시키지 않고
  **문장 경계 절단(clamp)** 으로 회복한다 (Fallback 필수 원칙).
- `packages/shared` 또는 `packages/ai`에 `MAX_REPLY_CHARS`(제안: 400) 상수 + clamp 함수:
  캡 이내면 원문 그대로, 초과 시 캡 이내 마지막 문장 경계에서 절단
  (문장 경계가 없으면 캡에서 하드 절단). 기존 문장 분할 로직이 있으면 재사용.
- `getTurnFeedback()` 파싱 성공 후 reply에 clamp 적용.
- **테스트**: 짧은 reply 불변 / 초과 reply 문장 경계 절단 / 문장 경계 없는 초과 입력 하드 절단.

## 3. 순서·의존성

```
V1 스키마(마이그레이션+RLS 검증) → V1 클라이언트 → V1 E2E
V2 독립 (병행 가능)
```

## 4. 완료 정의

- [ ] supabase 모드: 로그아웃→재로그인 시 온보딩 스킵·홈 직행, 서버 streak 표시
- [ ] 재조회 실패 시에도 앱 진행 가능 (폴백)
- [ ] `npx tsx scripts/verify-rls.mts` 전 케이스 PASS (신규 케이스 포함)
- [ ] reply 초과 입력이 문장 경계에서 절단되어 반환
- [ ] `npm run ci` 그린, 신규 로직 커버리지 80%+
