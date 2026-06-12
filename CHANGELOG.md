# CHANGELOG

## 2026-06-12 (세션 2) — T2 완결 + T4 Supabase (보안 민감 ted-run)

- T2: 짧은 발화 벤치마크(`spike/bench.mts`) — 현행 모델+TTS 스트리밍 중앙값 3.51s ✅, gpt-4o-mini 조합 기각 (ADR-0003 갱신)
- T4: 로컬 Supabase(Docker, 포트 553xx) — 스키마+RLS 마이그레이션, 시드, supabase-js 클라이언트, Dev Mock Auth(프로덕션 가드 포함)
- 보안(2b 적대적 리뷰 + 1차 리뷰 교차): is_premium·streak·발화시간 위조 차단(컬럼 grant), 통계 서버 트리거 전환, **PK 셔플 farming 우회 차단**, 대화 턴 불변 로그, KST streak 경계 — RLS 공격 시나리오 33케이스 검증(`scripts/verify-rls.mts`)
- ADR-0004(데이터 계층 — Prisma 제외·RLS 모델·CVE 예외), Phase 1 작업계획서(`docs/plans/p1-core-loop.md`)
- 테스트 45개·커버리지 99/92/100%, E2E(웹 export, supabase 클라이언트 포함 번들) 통과

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
