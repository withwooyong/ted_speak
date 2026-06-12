# ADR-0002: 오디오 I/O — expo-av 대신 expo-audio

- 날짜: 2026-06-12
- 상태: 승인
- 관련: PLAN.md §6.1 (Audio I/O: expo-av), docs/plans/p0-foundation.md T3

## 맥락

PLAN.md는 expo-av를 지정했으나, Expo SDK 56에서 expo-av는 deprecated이며
expo-audio / expo-video로 분리·대체되었다.

## 결정

녹음·재생은 **expo-audio**(`useAudioRecorder` / `useAudioPlayer`)를 사용한다.
녹음 프리셋은 `RecordingPresets.HIGH_QUALITY`(m4a) — Whisper 업로드 지원 포맷이다.

## 결과

- `apps/mobile/src/app/dev/audio-poc.tsx` POC 화면 기준으로 Phase 1 녹음 UX를 구현한다.
- 실기기/시뮬레이터 검증은 T3 완료 조건 (수동 확인 필요).
