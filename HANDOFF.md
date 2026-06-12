# HANDOFF — Ted Speak (TalkTed)

> 마지막 업데이트: 2026-06-12 (세션 2) | Phase 0 사실상 완료 — T3 기기 검증만 잔여

## 현재 상태

| 영역 | 상태 |
|---|---|
| HTML 프로토타입 | ✅ `prototype/index.html` |
| AI 파이프라인 (T1) | ✅ `packages/ai` — stt(model 옵션)/tutor/tts(+스트리밍) |
| 턴 지연 (T2) | ✅ **완료** — 짧은 발화+스트리밍 중앙값 3.51s ≤4s. gpt-4o-mini 조합은 더 느려서 기각, 현행 모델 유지 (ADR-0003 실측 데이터) |
| 오디오 POC (T3) | 🔶 코드 완료, **기기 검증 잔여** — 이 머신은 Xcode 미설치(CommandLineTools만)라 시뮬레이터 불가. Xcode 설치 또는 실기기 Expo Go 필요 |
| Supabase (T4) | ✅ **로컬 완료** — 스키마+RLS 마이그레이션, 통계 트리거, supabase-js 클라이언트, Dev Mock Auth. RLS 공격 시나리오 33케이스 통과. **호스팅 프로젝트 생성·db push는 사용자 액션** |
| 콘텐츠 (T5) / 스타일 ADR (T6) / CI (T7) | ✅ (세션 1) |
| Phase 1 작업계획서 | ✅ `docs/plans/p1-core-loop.md` (U1~U11) |

## 로컬 Supabase

- `supabase start` (포트 **553xx** — ted_duolingo의 543xx와 충돌 회피) → `supabase db reset`(마이그레이션+시드)
- RLS 검증: `npx tsx scripts/verify-rls.mts` (33케이스, 로컬 전용 가드)
- 앱 연결: `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321` + anon key(`supabase start` 출력)
- env 미설정 시 Dev Mock Auth로 부팅. **프로덕션 빌드는 env 누락 시 의도적으로 빌드 실패** (auth-config isProd 가드)

## 다음 세션이 할 일

1. **Phase 1 착수**: `/ted-run docs/plans/p1-core-loop.md` — U1(ai 타임아웃·재시도)부터
2. **T3 기기 검증** (사용자): Xcode 설치 후 시뮬레이터 또는 실기기에서 `npm run mobile` → `/dev/audio-poc`
3. **호스팅 Supabase** (사용자): 프로젝트 생성 → `supabase link` + `db push` → EAS 환경변수 설정

## 주의사항

- 보안 수정 이력: profiles·user_progress는 **컬럼 grant 화이트리스트** 패턴 — 새 컬럼 추가 시 grant 검토 필수 (ADR-0004)
- 통계(streak/발화시간)는 user_progress INSERT 트리거 전담, 클라이언트 직접 update 금지
- streak 날짜 경계 KST 고정 — 글로벌 확장 시 profiles.timezone (P1 TODO)
- 커버리지 게이트 80% (현재 99/92/100%), vitest `@ted-speak/shared` alias 제거 금지
- 커밋 한글, **푸시는 명시 요청 시에만**
