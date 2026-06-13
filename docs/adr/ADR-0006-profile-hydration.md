# ADR-0006: 재로그인 프로필 하이드레이트 + reply 길이 clamp (P1.5)

- 날짜: 2026-06-13
- 상태: 승인
- 관련: docs/plans/p1-polish.md (V1·V2), ADR-0004, ADR-0005(§42·§45-46 한계 해소)

## 맥락

ADR-0005가 P2 과제로 남긴 두 가지를 해소한다.

1. **재로그인 시 서버 상태 미반영**: supabase 실로그인 모드에서 로그아웃(로컬 스토어 reset)
   후 재로그인하거나 새 기기에서 로그인하면, 서버 profiles에 온보딩이 저장된 기존 사용자도
   온보딩을 다시 타고 서버 streak·통계가 화면에 반영되지 않았다. 가입 트리거가 기본값으로
   행을 만들기 때문에 기존 컬럼만으로는 "온보딩 완료"를 판별할 수 없었다.
2. **reply 길이 상한 부재**: `TurnFeedback.reply`가 `max_tokens(220)`에만 의존해, 비정상적으로
   긴 reply가 TTS 비용·재생 시간을 키울 수 있었다.

## 결정

1. **온보딩 완료 마커 `profiles.onboarded_at timestamptz`**(마이그레이션 `20260613000000`).
   null이면 미완료. `grant update (onboarded_at) to authenticated`로 클라이언트가 쓴다 —
   **위조 영향 분석**: 본인 행의 onboarded_at 조작 결과는 *본인* 온보딩 스킵뿐이라 통계·과금
   컬럼과 달리 무해하고, 타인 행은 기존 RLS 행 정책이 차단한다. verify-rls에 ① 본인 허용
   ② 타인 위조 차단 ③ grant 확대 후에도 streak·is_premium은 여전히 거부(독립 케이스)를 추가.
2. **실로그인 시 profiles 1회 재조회 하이드레이트**(`lib/profile-sync.ts`). auth 스토어를
   모듈 측에서 구독한다(`lib/progress.ts`와 동일 — auth↔user/progress require cycle 방지).
   `profileToHydration()`이 서버 row를 로컬 스토어로 매핑하되 **방어적 검증**: goal/level이
   enum 밖이면 null(온보딩 재진입이 안전), daily_goal_minutes 1~120 밖이면 10, streak 음수·
   비정수면 0, last_study_date는 `YYYY-MM-DD` 형식 외면 null. **권위 출처 구분**: streak·
   last_study_date는 서버 트리거(ADR-0004)가 권위라 로컬을 덮어쓰고, xp·todaySpeakingSeconds·
   micGranted는 서버 컬럼이 없거나 기기 로컬 속성이라 동기화하지 않는다.
3. **하이드레이트 신뢰·동시성 경계**:
   - **스테일 응답 폐기**: fetch await 직후 현재 auth user.id가 요청 시점 userId와 다르면
     patch 적용·hydrating 해제를 모두 건너뛴다 — in-flight 중 사용자 전환 시 타인 스토어에
     PII가 주입되는 경로(2b HIGH)를 차단한다. in-flight 전역 플래그는 두지 않는다(같은 userId
     중복은 fetch 시작 전 동기 세팅하는 `lastHandledUserId`가 막고, 플래그를 두면 오히려
     사용자 전환 시 새 사용자 하이드레이트가 스킵된다).
   - **anti-flash**: `setHydrating(true)`는 구독 콜백의 동기 구간에서 호출해 auth 갱신과 같은
     배치에 묶는다. 라우팅(`index.tsx`·`login.tsx`)은 `hydrating` 동안 대기해 온보딩으로
     잘못 튕기지 않는다. `login.tsx`는 imperative 라우팅(스테일 onboarded) 대신 status·
     hydrating·onboarded가 확정되면 도는 반응형 effect로 라우팅 단일 출처화.
   - **PII 정리**: 리스너 경유 로그아웃(세션 만료·원격 토큰 폐기)도 `signOut()`을 거치지
     않으므로, profile-sync 구독의 `!user` 분기에서 항상 reset + persist 삭제한다(2b MEDIUM).
     persist 재수화가 reset 이후 늦게 끝나 옛 값이 부활하는 창은 `hasHydrated`/
     `onFinishHydration` 가드로 닫는다(2b LOW Q3). reset은 `hydrating:false`를 포함해
     in-flight 잔존 플래그도 정리한다.
4. **reply 길이 clamp**(`clampReply`, `MAX_REPLY_CHARS=400`, `packages/shared`). 스키마
   `.max()` 하드 실패는 채택하지 않는다 — LLM이 캡을 넘겨도 턴 전체를 실패시키지 않고
   캡 이내 마지막 문장 경계에서 절단(경계 없으면 하드 절단)해 회복한다(Fallback 필수 원칙).
   `getTurnFeedback()` 파싱 성공 후 reply에만 적용 — TTS 입력은 reply 하나뿐이고
   corrections·encouragement·openingLine은 TTS를 타지 않아 비용 경로가 reply로 한정된다.

## 알려진 한계

- 동일 사용자가 fetch 수명 내 로그아웃→재로그인할 때 구 fetch가 실패 응답이면
  `setHydrating(false)`가 신 fetch 완료 전 조기 실행될 수 있다(온보딩 flash 가능, 데이터
  손상 없음 — 2b/2a LOW). 세대 토큰 도입은 P2 W7에서 재평가.
- 오프라인 콜드 스타트에서 supabase-js가 토큰 리프레시 실패로 INITIAL_SESSION을 null로
  방출하면, 곧 회복될 정당한 사용자의 로컬 카운터(xp·todaySpeakingSeconds·micGranted)가
  와이프된다(가용성 LOW). 해당 필드를 서버 컬럼으로 승격하면 자연 해소(P2).
- 웹은 user 스토어가 메모리 폴백(AsyncStorage SSR 이슈)이라 "앱 재시작 후 유지" 검증 불가 —
  네이티브는 영속(기존 한계 유지).
