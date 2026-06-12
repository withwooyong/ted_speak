# ADR-0001: 모바일 스타일링 — StyleSheet + 디자인 토큰 (NativeWind 보류)

- 날짜: 2026-06-12
- 상태: 승인
- 관련: PLAN.md §6.1 (UI: NativeWind), docs/plans/p0-foundation.md T6

## 맥락

PLAN.md는 NativeWind를 UI 레이어로 지정했다. 그러나 스캐폴딩 시점의 Expo SDK 56은
React Native 0.85 + React 19.2 기반인데, NativeWind 안정 버전(4.2.5)은 RN 0.7x 시기에
설계되었고 RN 0.85 공식 지원이 확인되지 않는다. v5는 preview(5.0.0-preview.4) 단계다.

## 결정

1. Phase 0~1은 **React Native StyleSheet + `@ted-speak/shared`의 디자인 토큰**으로 구현한다.
   토큰(colors/radius/font)은 HTML 프로토타입에서 검증된 값을 단일 출처로 사용한다.
2. **NativeWind 5가 stable이 되고 해당 Expo SDK를 공식 지원하면 재평가**한다.
   재평가 시점에 화면 수가 적을수록 전환 비용이 낮으므로, Phase 1 완료 전 재확인한다.

## 근거

- "장애 없이 / 정확한 구조로" 기조 — 미검증 호환성 위에 전체 UI를 쌓지 않는다.
- 토큰을 shared 패키지로 분리해 두면 스타일링 라이브러리 교체 시에도 값은 재사용된다.

## 결과

- 모든 화면은 `StyleSheet.create` + `colors`/`radius` 토큰만 사용 (인라인 hex 금지).
- PLAN.md §6.1의 NativeWind 항목은 본 ADR로 대체된다.
