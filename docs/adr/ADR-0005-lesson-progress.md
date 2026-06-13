# ADR-0005: 레슨 진행 영속화·이어하기 + 클라이언트 신뢰 경계 (P1)

- 날짜: 2026-06-12
- 상태: 승인
- 관련: PLAN.md §4.2 (레슨 3단계), §8, docs/plans/p1-core-loop.md U5~U8, ADR-0004

## 맥락

P1 핵심 루프는 "앱 재시작 후 이어하기·완료 상태 유지"(U7)와 mock·supabase 양 모드 동작을
요구한다. 레슨 상태 머신(`lesson-core.ts`)은 순수 모듈이므로, 영속화 계약과 보안 경계를
별도로 정해야 했다.

## 결정

1. **상태 머신 스냅샷은 `lesson_sessions.snapshot`(text)에 opaque 문자열로 저장**
   (마이그레이션 `20260612090000`). 서버는 해석하지 않고, 클라이언트 `fromSnapshot()`이
   손상·구버전·범위 밖 값을 전부 초기 상태로 폴백한다(방어적 역직렬화). jsonb가 아닌
   text인 이유: 서버 측 질의·검증이 불필요한 클라이언트 전용 값이기 때문.
2. **완료 시점 순서 보장**: `completeSession → recordProgress → applyReward(낙관적 UI)`를
   단일 비동기 흐름으로 실행하고, `step='complete'` 상태는 스냅샷으로 저장하지 않는다
   (크래시 윈도우에서 재진입 시 이중 보상 차단 — 2a 리뷰 지적). `user_progress` insert의
   PK 충돌(PG 23505)은 멱등 무시 — 재완료는 보상 없이 통과.
3. **대화 이어하기는 `conversation_turns` 재조회로 복원** (`getTurns`) — 히스토리·버블을
   DB(불변 로그)에서 재구성하고 openingLine 재발화를 차단한다.
4. **데이터 계층은 `ProgressRepo` 단일 인터페이스** — supabase 구현은 grant 화이트리스트
   컬럼만 쓰고(ADR-0004), mock 구현은 AsyncStorage에 **user id 네임스페이스**로 저장한다.
5. **로그아웃 시 로컬 PII 정리** — user 스토어 reset + persist 저장소 삭제. 공유 단말에서
   다음 사용자에게 이전 사용자의 진행·통계가 보이지 않게 한다(2b 적대적 리뷰 지적).
   repo 캐시 정리는 `lib/progress.ts`의 auth 스토어 구독으로 처리(require cycle 방지).
6. **OpenAI 키는 dev 전용 주입** — `EXPO_PUBLIC_OPENAI_API_KEY`는 정의상 번들에 인라인되므로,
   `getAiConfig()`가 `!__DEV__`에서 무조건 null을 반환해 prod에서 사용 자체를 차단한다.
   출시 전 Edge Function 프록시로 전환(CLAUDE.md 코드 규칙)이 전제이며, 그 전까지 prod
   빌드는 음성 기능이 비활성이다.
7. **시드 SQL은 콘텐츠 JSON에서 생성** — `npm run generate:seed`
   (`packages/shared/src/seed-sql.ts` + `scripts/generate-seed.mts`)가 `supabase/seed.sql`을
   재생성한다(멱등 upsert, `''` 이스케이프, 수동 동기화 제거 — P0 TODO 해소).

## 알려진 한계

- mock 모드 스냅샷·통계는 단말 로컬 전용 — 기기 변경 시 소실(설계상 수용, dev 전용).
- `applyReward`의 streak는 낙관적 근사치 — 권위는 서버 트리거(ADR-0004). supabase 모드에서
  profiles 재조회 동기화는 **ADR-0006(P1.5)에서 해소**.
- tts-cache 키는 32bit FNV-1a — 시드 규모(수십 문장)에서 충돌 확률 무시 가능, 커뮤니티
  콘텐츠 도입 시 64bit 이상으로 확장(2b 리뷰 LOW 기록).
- `TurnFeedback` reply 길이 상한은 max_tokens(220)만 — 문장 경계 clamp는 **ADR-0006(P1.5)에서
  해소**(`.max()` 하드 실패 대신 회복형 절단).
