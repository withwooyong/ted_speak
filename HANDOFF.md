# HANDOFF — Ted Speak (TalkTed)

> 마지막 업데이트: 2026-06-12 | Phase 0 Foundation 1차 ted-run 완료

## 현재 상태

| 영역 | 상태 |
|---|---|
| HTML 프로토타입 (동선·UI 검증) | ✅ `prototype/index.html` — 브라우저로 열면 전체 플로우 클릭 가능 |
| Expo 모노레포 | ✅ apps/mobile(SDK 56) + packages/{shared,ai} + content |
| AI 파이프라인 모듈 (T1) | ✅ `packages/ai` — transcribe/getTurnFeedback/synthesize(Stream), 테스트 33개 |
| 턴 지연 최적화 (T2) | 🔶 TTS 스트리밍으로 v1 5.4~5.9s → 3.3~4.9s(중앙값 4.22s). **≤4s 일관 달성은 미완** — ADR-0003의 Phase 1 레버 참조 |
| 오디오 POC (T3) | 🔶 코드 완료(`/dev/audio-poc`), **시뮬레이터/실기기 검증 필요** (사용자 액션) |
| Supabase (T4) | ⬜ 보류 — 사용자의 Supabase 프로젝트 생성 대기. 착수 시 **보안 민감 분류로 ted-run** (2b 적대적 리뷰 + 3-4 보안 스캔 필수) |
| 콘텐츠 파이프라인 (T5) | ✅ zod 스키마 + 홈 화면 콘텐츠 로딩 + 검증 테스트 |
| 스타일링 ADR (T6) | ✅ ADR-0001 — StyleSheet+토큰, NativeWind 보류 |
| CI (T7) | ✅ `npm run ci` + `.github/workflows/ci.yml` (remote 생성 후 동작) |

## 다음 세션이 할 일 (우선순위)

1. **T3 검증**: `npm run mobile` → iOS 시뮬레이터에서 `/dev/audio-poc` 녹음→재생 확인, 녹음 m4a를 `npm run spike -- <파일>`로 Whisper 호환 확인
2. **T4**: Supabase 프로젝트 생성 후 Prisma 스키마 + RLS + 이메일 Auth + Dev Mock Auth (`docs/plans/p0-foundation.md` T4)
3. **T2 잔여**: 짧은 실발화(2~5초)로 지연 재측정 — 목표 미달 시 gpt-4o-mini 검토
4. Phase 1 작업계획서(`docs/plans/p1-core-loop.md`) 작성 — 레슨 3단계 실제 UI/로직 (HTML 프로토타입이 UX 스펙)

## 주의사항

- `OPENAI_API_KEY`는 레포에 없음 — `.env.example` 참조. 스파이크 실행 시 환경변수로 주입
- 커버리지 게이트: lines/branches/functions 80% (`vitest.config.ts`) — 현재 98.8/90/100%
- 워크스페이스 심링크 때문에 vitest에 `@ted-speak/shared` alias 필수 (제거하면 커버리지 병합 깨짐)
- 커밋 메시지 한글, **푸시는 사용자 명시 요청 시에만** (remote 미설정 상태)
