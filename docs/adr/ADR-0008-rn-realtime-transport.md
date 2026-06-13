# ADR-0008: RN 프리토킹 전송 계층 + 라이브 음성 이월

- 날짜: 2026-06-13
- 상태: **승인** (P2 W2 기반 단위)
- 관련: ADR-0007(Realtime 승인), docs/plans/p2-w2-pretalk.md, PLAN.md §4.3·§6.2(Hybrid)

## 맥락

ADR-0007에서 AI 튜터 전송 계층으로 **Realtime을 채택**했다(첫 응답 0.63s·barge-in 175ms). 단
그 실측은 **헤드리스 노드 + WebSocket + TTS 합성 입력**이었다. RN 앱에서 라이브 양방향 음성을
하려면 둘 중 하나가 필요하다.

1. **WebRTC** (`react-native-webrtc`) — OpenAI가 권장하는 클라이언트 경로. 마이크 캡처·재생·에코
   제거·지터 버퍼를 네이티브가 처리. **커스텀 dev build 필요**(config plugin) — Expo Go 불가.
2. **WebSocket + 수동 PCM 스트리밍** — expo-audio로 마이크를 연속 PCM 프레임으로 캡처·재생.
   expo-audio는 클립/파일 중심이라 저수준 연속 스트리밍 지원이 약하고, 사실상 네이티브 모듈이 또 필요.

현재 프로젝트는 **Expo Go**(react-native-webrtc 없음, eas.json 없음, Xcode 미설치)라 둘 다 지금
환경에서 구동·검증할 수 없다. W2 전체를 라이브 음성까지 한 번에 끝내려면 dev build 인프라(EAS,
경우에 따라 Apple Developer 계정)가 선행돼야 한다.

## 결정

### 1. 전송 타깃은 WebRTC (라이브 구현 시)
라이브 음성은 `react-native-webrtc` 기반으로 구현한다(권장 경로, 네이티브 오디오 파이프라인 재사용).
WebSocket+PCM은 폴백 후보로만 둔다.

### 2. W2는 전송 인터페이스(seam) 뒤에 기반부터 구현 — 라이브는 이월
`TutorTransport` 인터페이스(`apps/mobile/src/lib/tutor-transport.ts`)를 두고, 코어·UI는 이 인터페이스에만
의존한다. 두 구현을 제공한다.
- `MockTutorTransport` — 결정적 스크립트 응답. 디바이스/네트워크 없이 UI·상태머신을 E2E 구동·테스트.
  **텍스트 미리보기 모드**(마이크/네트워크 부재 폴백 — ADR-0005 Fallback 원칙)가 이 경로를 쓴다.
- `RealtimeTutorTransport` — **미구현 이월 스텁**. connect()는 "dev build 필요" 에러로 거부해 호출부가
  잡아 폴백할 수 있다. 라이브 구현·실기기 검증은 후속 세션(dev build 전제).

이로써 스키마·RLS·세션 상태머신·일일 캡·UI를 **지금 Expo Go에서 완결·검증**하고, 디바이스 의존
전송만 격리해 이월한다. W1 스파이크(`packages/ai/spike/realtime.mts`)가 라이브 구현의 프로토콜 레퍼런스다.

### 3. tutor duration은 서버 권위로 산정하고, profiles 통계에는 누적하지 않는다
`tutor_sessions.duration_seconds`는 `profiles.total_speaking_seconds`로 누적하는 **서버 트리거를 두지
않는다**(user_progress와 달리). 주간 스피킹 리포트(W6)는 tutor_sessions를 **클라이언트에서 집계**한다.

**컬럼 lockdown + 서버 권위 완료(보안 리뷰 HIGH 반영)**: duration_seconds·turn_count·started_at·status를
클라이언트가 직접 쓰면 일일 캡(비용 통제 전제)이 무력화된다. 그래서 `user_progress` 패턴대로
`revoke insert, update` 후 `grant insert (user_id, topic)`만 부여하고, **완료는 `complete_tutor_session`
RPC(security definer)로만** 한다. RPC가 `duration_seconds = clamp(now() - started_at, 0, 3600)`을
**서버에서 산정**하고(클라 보고 불신), 본인·in_progress 세션만 완료한다(재완료·status 되돌리기 차단).

**미완료 우회 차단**: 일일 캡(`getTodaySessionSeconds`)은 완료 세션의 서버 duration + **진행 중 세션의
경과 시간**(SESSION_MAX로 클램프)을 합산한다 — 세션을 완료하지 않고 버려서 캡을 우회하는 것을 막는다.
verify-rls가 직접 위조 차단 + RPC 완료를 검증한다(52케이스).

### 4. 비용 통제 (ADR-0007 이행)
세션 길이 cap(`SESSION_MAX_SECONDS=300`)과 일일 시간 상한(`DAILY_CAP_SECONDS=300`, 소프트)을
tutor-core·tutor-repo에 하드하게 둔다. 라이브 도입 시 시나리오별 토큰 프로파일을 재측정해 분당 비용을 갱신한다.

### 5. 실사용 VAD는 on (스파이크와 반대)
라이브 구현 시 서버 VAD on(자연 turn-taking) + 클라이언트 barge-in을 쓴다. W1 스파이크의 VAD off는
순수 측정용 설정이며 제품 동작과 무관하다(ADR-0007 결정란).

## 대안

- **지금 dev build로 라이브부터** — EAS dev build + react-native-webrtc 셋업 선행. 인프라·Apple 계정
  전제로 환경 셋업에서 멈출 위험이 크고, 기반(스키마·로직·UI) 없이 전송만 먼저 하면 검증 표면이 좁다. 기각.
- **WebSocket+PCM 스트리밍** — Expo Go 호환 기대했으나 expo-audio 연속 캡처 제약으로 결국 네이티브
  모듈/ dev build 필요. WebRTC 대비 직접 구현 부담만 큼. 폴백 후보로만 유지.

## 결과

- 신규: `tutor-core.ts`(상태머신)·`tutor-repo.ts`(저장소+일일 캡)·`tutor-transport.ts`(인터페이스+목+이월
  스텁)·`tutor.ts`(repo 팩토리)·`(tabs)/tutor.tsx`(주제→세션→요약 UI). 마이그레이션 `tutor_sessions`/`tutor_turns`.
- 검증: vitest 신규 모듈 단위 테스트, RLS 47케이스(튜터 11 추가), Expo Go에서 텍스트 미리보기 동선.
- 이월(후속, dev build 전제): `RealtimeTutorTransport`(WebRTC) 구현, 실마이크 스트리밍, 실기기 5분 완주
  검증, 시나리오별 비용 재측정 → ADR-0007 갱신.

## 알려진 한계

- 텍스트 미리보기 모드의 "발화 시간"은 단어 수 기반 **추정**이다(실측 아님). 라이브 음성 도입 시 실제
  측정값으로 대체된다. 일일 캡의 세션 duration은 세션 경과 시간(wall-clock)을 쓴다.
- MockTutorTransport 응답은 고정 스크립트다 — 실제 LLM 대화 품질·교정 정확도는 라이브 구현에서 검증.
