# CHANGELOG

## 2026-06-12 — Phase 0 킥오프 + Foundation 1차 ted-run

- HTML 프로토타입(`prototype/index.html`) — 온보딩→홈→레슨 3단계→완료→튜터/프로필 전 동선 클릭 검증, TTS 실동작
- AI 스파이크: Whisper→GPT-4o→TTS 1턴 E2E 검증 (v1 순차 5.4~5.9s)
- Expo 모노레포 스캐폴딩: apps/mobile(SDK 56, Expo Router IA) + packages/shared(토큰·타입) + packages/ai + content 시드 1레슨
- `docs/plans/p0-foundation.md` 작성, `/ted-run` 1차 실행 (T1·T2·T5·T6·T7):
  - T1: `packages/ai` 모듈화 (stt/tutor/tts, 키 주입식, 테스트 33개·커버리지 98.8%)
  - T2: TTS 스트리밍 재생 + max_tokens cap + 로컬 drill 채점 — 체감 지연 중앙값 4.22s (목표 ≤4s 근접, 미완)
  - T5: zod 콘텐츠 스키마 + 홈 화면 콘텐츠 로딩 (E2E 스크린샷 검증)
  - T6: ADR-0001 스타일링(StyleSheet+토큰), ADR-0002 expo-audio, ADR-0003 지연 전략
  - T7: `npm run ci` + GitHub Actions 워크플로
- 이중 리뷰 반영: 스트림 리더 누수, 스키마 이중 정의 해소(z.infer 단일 출처), 커버리지 병합 버그(워크스페이스 심링크) 등 9건 수정
